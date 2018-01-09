// ----------------------------------------
// src/includes/core.js
// ----------------------------------------

// all initialisations should go here
var init = function() {

  welcome();
  populateGlobal();

  // -- init internal state vars --
  startTime = Date.now();
  currStrokeWeight = 1;
  currStrokeTint = 100;
  currFillTint = 100;
  currCanvasMode = pub.PAGE;
  currColorMode = pub.RGB;
  currGradientMode = pub.LINEAR;
  currDialogFolder = Folder("~");
  currMode = pub.MODEVISIBLE;

  // needs to be reassigned, as it can still have a previous script name in global
  // when switching between scripts using the loop target engine
  $.global.SCRIPTNAME = pub.SCRIPTNAME;

  appSettings = {
    enableRedraw: app.scriptPreferences.enableRedraw,
    preflightOff: app.preflightOptions.preflightOff
  };

  app.doScript(runScript, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, pub.SCRIPTNAME);

  exit(); // quit program execution
};


// ----------------------------------------
// execution

var runScript = function() {

  var execTime;

  try {

    if($.global.loop instanceof Function) {
      if ($.engineName !== "loop") {
        error("function loop(), no target engine! To use basil's loop function, add the code line\n\n #targetengine \"loop\";\n\n at the very top of your script.");
      } else {
        prepareLoop();
      }
    }

    // app settings
    app.scriptPreferences.enableRedraw = true;
    app.preflightOptions.preflightOff = true;

    currentDoc();

    if ($.global.setup instanceof Function) {
      setup();
    }

    if ($.global.draw instanceof Function) {
      draw();
    } else if ($.global.loop instanceof Function) {
      // TODO implement something like pub.frameRate()
      var sleep = null;
      if (arguments.length === 0) sleep = Math.round(1000 / 25);
      else sleep = Math.round(1000 / framerate);

      var idleTask = app.idleTasks.add({name: "basil_idle_task", sleep: sleep});
      idleTask.addEventListener(IdleEvent.ON_IDLE, function() {
        loop();
      }, false);
      println("Run the script lib/stop.jsx to end the draw loop and clean up!");
    }

  } catch (e) {
    execTime = executionDuration();

    if(e.userCancel) {
      println("[Cancelled by user after " + execTime + "]");
    } else {
      println("[Cancelled after " + execTime + "]");
      alert(e);
    }

  } finally {

    if(!execTime) {
      println("[Finished in " + executionDuration() + "]");
    }

    if(currDoc && !currDoc.windows.length) {
      currDoc.windows.add(); // open the hidden doc
    }
    closeHiddenDocs();
    if (progressPanel) {
      progressPanel.closePanel();
    }
    if (addToStoryCache) {
      addToStoryCache.close();
    }

    // resetUserSettings();   // TODO: bring back later
  }

}

var prepareLoop = function() {
  // TODO rework this to use the new pub.file() and pub.folder() functions

  // before running the loop we need to check if
  // the stop script exists
  // the script looks for the lib folder next to itself
  var currentBasilFolderPath = File($.fileName).parent.fsName;
  var scriptPath = currentBasilFolderPath + "/lib/stop.jsx";

  if(File(scriptPath).exists !== true) {
    // the script is not there, let's create it
    var scriptContent = [
      "#targetengine \"loop\"",
      "b.noLoop();",
      "if (cleanUp instanceof Function) cleanUp(true);",
      "cleanUp = null;"
    ];
    if(Folder(currentBasilFolderPath + "/lib").exists !== true) {
      // the lib folder also does not exist
      var res = Folder(currentBasilFolderPath + "/lib").create();
      if(res === false) {
        error("An error occurred while creating the \"/lib\" folder. Please report this issue");
        return;
      }else{
        // the folder is there
      }
      var libFolder = Folder(currentBasilFolderPath + "/lib");
      var stopScript = new File(libFolder.fsName + "/stop.jsx");
      stopScript.open("w", undefined, undefined);
    // set encoding and linefeeds
      stopScript.lineFeed = Folder.fs === "Macintosh" ? "Unix" : "Windows";
      stopScript.encoding = "UTF-8";
      stopScript.write(scriptContent.join("\n"));
      stopScript.close();
    }
  }else{
    // the script is there
    // awesome
  }
}

/**
 * Stops basil from continuously executing the code within loop().
 *
 * @cat Environment
 * @method noLoop
 */
pub.noLoop = function(printFinished) {
  var allIdleTasks = app.idleTasks;
  for (var i = app.idleTasks.length - 1; i >= 0; i--) {
    allIdleTasks[i].remove();
  }
  println("Basil.js -> Stopped looping.\n");
  if(printFinished) {
    println("[Finished in " + executionDuration() + "]");
  };
};

/**
 * Used to set the performance mode. While modes can be switched during script execution, to use a mode for the entire script execution, <code>drawMode</code> should be placed in the beginning of the script. In basil there are three different performance modes:
 * <code>MODEVISIBLE</code> is the default mode. In this mode, during script execution the document will be processed with screen redraw, allowing to see direct results during the process. As the screen needs to redraw continuously, this is slower than the other modes.
 * <code>MODEHIDDEN</code> allows to process the document in background mode. The document is not visible in this mode, which speeds up the script execution. In this mode you will likely look at InDesign with no open document for quite some time – do not work in InDesign during this time. You may want to use <code>b.println("yourMessage")</code> in your script and look at the console to get information about the process. Note: In order to enter this mode either a saved document needs to be open or no document at all. If you have an unsaved document open, basil will automatically save it for you. If it has not been saved before, you will be prompted to save it to your hard drive.
 * <code>MODESILENT</code> processes the document without redrawing the screen. The document will stay visible and only update once the script is finished or once the mode is changed back to <code>MODEVISIBLE</code>.
 *
 * @cat Environment
 * @method drawMode
 * @param  {String} mode The performance mode to switch to.
 */
pub.drawMode = function(mode) {

  if(!(mode === pub.MODEVISIBLE || mode === pub.MODEHIDDEN || mode === pub.MODESILENT)) {
    error("drawMode(), invalid argument. Please use MODEVISIBLE, MODEHIDDEN or MODESILENT.");
  }

  app.scriptPreferences.enableRedraw = (mode === pub.MODEVISIBLE || mode === pub.MODEHIDDEN);

  if(!currDoc) {
    // initiate new document in given mode
    currentDoc(mode);
  } else {

    if (!currDoc.saved && !currDoc.modified && pub.MODEHIDDEN) {
      // unsaved, unmodified doc at the beginning of the script that needs to be hidden
      // -> will be closed without saving, new document will be opened without showing
      currDoc.close(SaveOptions.NO);
      currDoc = app.documents.add(false);
      setCurrDoc(currDoc);
    } else if (mode === pub.MODEHIDDEN && currMode !== pub.MODEHIDDEN) {
      // existing document needs to be hidden
      if (!currDoc.saved && currDoc.modified) {
        try {
          currDoc.save();
        } catch(e) {
          throw {userCancel: true};
        }
        warning("Document was not saved and has now been saved to your hard drive in order to enter MODEHIDDEN.");
      } else if (currDoc.modified) {
        currDoc.save(File(currDoc.fullName));
        warning("Document was modified and has now been saved to your hard drive in order to enter MODEHIDDEN.");
      }
      var docPath = currDoc.fullName;
      currDoc.close(); // close the doc and reopen it without adding to the display list
      currDoc = app.open(File(docPath), false);

      setCurrDoc(currDoc);
    } else if (mode !== pub.MODEHIDDEN && currMode === pub.MODEHIDDEN) {
      // existing document needs to be unhidden
      currDoc.windows.add();
    }
  }

  if (!progressPanel && (mode === pub.MODEHIDDEN || mode === pub.MODESILENT)) {
    // turn on progress panel
    progressPanel = new Progress();
  } else if (progressPanel && mode === pub.MODEVISIBLE) {
    // turn off progress panel
    progressPanel.closePanel();
    progressPanel = null;
  }

  currMode = mode;
};


// ----------------------------------------
// all private from here

var welcome = function() {
  clearConsole();
  println("Running "
      + pub.SCRIPTNAME
      + " using basil.js "
      + pub.VERSION
      + " ...");
};

var populateGlobal = function() {
  // inject all functions of pub into global space
  // to make them available to the user

  if($.engineName === "loop" && $.global.VERSION) {
    // the global space is still populated from a previous run of the script
    return;
  }

  for(var key in pub) {
    if(pub.hasOwnProperty(key)) {
      if($.global.hasOwnProperty(key)) {
        // the user created a function or variable
        // with the same name as a basil has
        var pubFuncVar = pub[key] instanceof Function ? "function \"" : "variable \"";
        var globFuncVar = $.global[key] instanceof Function ? "function" : "variable";
        error("basil had problems creating the global " + pubFuncVar + key + "\", possibly because your code is already using that name as a " + globFuncVar + ". You may want to rename your " + globFuncVar + " to something else.");
      } else {
        $.global[key] = pub[key];
      }
    }
  }
}

var currentDoc = function(mode) {
  if (!currDoc) {
    var doc = null;
    if (app.documents.length && app.windows.length) {
      doc = app.activeDocument;
      if (mode === pub.MODEHIDDEN) {
        if (!doc.saved) {
          try {
            doc.save();
          } catch(e) {
            throw {userCancel: true};
          }
          warning("Document was not saved and has now been saved to your hard drive in order to enter MODEHIDDEN.");
        } else if (doc.modified) {
          doc.save(File(doc.fullName));
          warning("Document was modified and has now been saved to your hard drive in order to enter MODEHIDDEN.");
        }
        var docPath = doc.fullName;
        doc.close(); // Close the doc and reopen it without adding to the display list
        doc = app.open(File(docPath), false);
      }
    } else {
      doc = app.documents.add(mode !== pub.MODEHIDDEN);
    }
    setCurrDoc(doc);
  }
  return currDoc;
};

var closeHiddenDocs = function () {
    // in Case we break the Script during execution in MODEHIDDEN we might have documents open that are not on the display list. Close them.
  for (var i = app.documents.length - 1; i >= 0; i -= 1) {
    var d = app.documents[i];
    if (!d.windows.length) {
      d.close(SaveOptions.NO);
    }
  }
};

var setCurrDoc = function(doc) {
  resetCurrDoc();
  currDoc = doc;
  // -- setup document --

  currDoc.viewPreferences.rulerOrigin = RulerOrigin.PAGE_ORIGIN;

  currFont = currDoc.textDefaults.appliedFont;
  currFontSize = currDoc.textDefaults.pointSize;
  currAlign = currDoc.textDefaults.justification;
  currLeading = currDoc.textDefaults.leading;
  currKerning = 0;
  currTracking = currDoc.textDefaults.tracking;
  // IMPORTANT this needs to be changed to be set to the default units
  // Otherwise a new document is already modified and could not properly
  // moved into MODEHIDDEN at the beginning of a script (because it would want to be saved)
  pub.units(pub.MM);

  updatePublicPageSizeVars();
};

var Progress = function () {
  this.init = function () {
    this.panel = Window.find("window", "processing...");
    if (this.panel === null) {
      this.panel = new Window("window", "processing...");
      var logo = (Folder.fs == "Macintosh") ? new File("~/Documents/basiljs/bundle/lib/basil.png") : new File("%USERPROFILE%Documents/basiljs/bundle/lib/basil.png");
      if (logo.exists) {
        this.panel.add("image", undefined, logo);
      }
      this.panel.statusbar = this.panel.add("edittext", [0, 0, 400, 300], "", {multiline: true, scrolling: false, readonly: true});
    }
    this.panel.statusbar.text = "Using basil.js " + pub.VERSION + " ... \nEntering background render mode ...";
    this.panel.show();
  };
  this.closePanel = function () {
    if (this.panel) {
      this.panel.hide();
      this.panel.close();
    }
  };
  this.writeMessage = function (msg) {
    if (Folder.fs == "Macintosh") { // Indesign Bug on Mac: Need to set app.scriptPreferences.enableRedraw = true to redraw window....
      var rd = app.scriptPreferences.enableRedraw;
      app.scriptPreferences.enableRedraw = true;
    }
    var lines = this.panel.statusbar.text.split(/\n/);
    if (lines.length > 17)
      lines.shift();
    lines.push(msg);
    this.panel.statusbar.text = lines.join("\n");
    this.panel.layout.layout();
    if (Folder.fs == "Macintosh") {
      app.scriptPreferences.enableRedraw = rd;
    }
  };
  this.init();
};

var resetCurrDoc = function() {
  // resets doc and doc specific vars
  currDoc = null;
  currPage = null;
  currLayer = null;
  currFillColor = "Black";
  noneSwatchColor = "None";
  currStrokeColor = "Black";
  currRectMode = pub.CORNER;
  currEllipseMode = pub.CENTER;
  currYAlign = VerticalJustification.TOP_ALIGN;
  currFont = null;
  currImageMode = pub.CORNER;

  pub.resetMatrix();
};

var currentLayer = function() {
  if (currLayer === null || !currLayer) {
    currentDoc();
    if (currDoc.windows.length) {
      currLayer = app.activeDocument.activeLayer;
    } else {
      currLayer = currDoc.layers[0];
    }
  }
  return currLayer;
};

var currentPage = function() {
  if (currPage === null || !currPage) {
    currentDoc();
    if (currDoc.windows.length) {
      currPage = app.activeWindow.activePage;
    } else {
      currPage = currDoc.pages[0];
    }
  }
  return currPage;
};

var updatePublicPageSizeVars = function () {
  var pageBounds = currentPage().bounds; // [y1, x1, y2, x2]
  var facingPages = currDoc.documentPreferences.facingPages;
  var singlePageMode = false;

  var widthOffset = heightOffset = 0;

  switch(pub.canvasMode()) {

    case pub.PAGE:
      widthOffset = 0;
      heightOffset = 0;
      pub.resetMatrix();
      singlePageMode = true;
      break;

    case pub.MARGIN:
      widthOffset = -currentPage().marginPreferences.left - currentPage().marginPreferences.right;
      heightOffset = -currentPage().marginPreferences.top - currentPage().marginPreferences.bottom;
      pub.resetMatrix();
      pub.translate(currentPage().marginPreferences.left, currentPage().marginPreferences.top);
      singlePageMode = true;
      break;

    case pub.BLEED:
      widthOffset = pub.doc().documentPreferences.documentBleedInsideOrLeftOffset + pub.doc().documentPreferences.documentBleedOutsideOrRightOffset;
      if(facingPages) {
        widthOffset = pub.doc().documentPreferences.documentBleedInsideOrLeftOffset;
      }
      heightOffset = pub.doc().documentPreferences.documentBleedBottomOffset + pub.doc().documentPreferences.documentBleedTopOffset;
      pub.resetMatrix();
      pub.translate(-pub.doc().documentPreferences.documentBleedInsideOrLeftOffset, -pub.doc().documentPreferences.documentBleedTopOffset);

      if(facingPages && currentPage().side === PageSideOptions.RIGHT_HAND) {
        pub.resetMatrix();
        pub.translate(0, -pub.doc().documentPreferences.documentBleedTopOffset);
      }
      singlePageMode = true;
      break;

    case pub.FACING_PAGES:
      widthOffset = 0;
      heightOffset = 0;
      pub.resetMatrix();

      var w = pageBounds[3] - pageBounds[1] + widthOffset;
      var h = pageBounds[2] - pageBounds[0] + heightOffset;

      pub.width = $.global.width = w * 2;

      if(currentPage().name === "1") {
        pub.width = $.global.width = w;
      } else if (currentPage().side === PageSideOptions.RIGHT_HAND) {
        pub.translate(-w, 0);
      }


      pub.height = $.global.height = h;
      break;

    case pub.FACING_BLEEDS:
      widthOffset = pub.doc().documentPreferences.documentBleedInsideOrLeftOffset + pub.doc().documentPreferences.documentBleedOutsideOrRightOffset;
      heightOffset = pub.doc().documentPreferences.documentBleedBottomOffset + pub.doc().documentPreferences.documentBleedTopOffset;
      pub.resetMatrix();
      pub.translate(-pub.doc().documentPreferences.documentBleedInsideOrLeftOffset, -pub.doc().documentPreferences.documentBleedTopOffset);

      var w = pageBounds[3] - pageBounds[1] + widthOffset / 2;
      var h = pageBounds[2] - pageBounds[0] + heightOffset;

      pub.width = $.global.width = w * 2;
      pub.height = $.global.height = h;

      if(currentPage().side === PageSideOptions.RIGHT_HAND) {
        pub.translate(-w + widthOffset / 2, 0);
      }

      break;

    case pub.FACING_MARGINS:
      widthOffset = currentPage().marginPreferences.left + currentPage().marginPreferences.right;
      heightOffset = currentPage().marginPreferences.top + currentPage().marginPreferences.bottom;
      pub.resetMatrix();
      pub.translate(currentPage().marginPreferences.left, currentPage().marginPreferences.top);

      var w = pageBounds[3] - pageBounds[1] - widthOffset / 2;
      var h = pageBounds[2] - pageBounds[0] - heightOffset;

      pub.width = $.global.width = w * 2;
      pub.height = $.global.height = h;

      if(currentPage().side === PageSideOptions.RIGHT_HAND) {
        pub.translate(-w - widthOffset / 2, 0);
      }

      return; // early exit

    default:
      error("b.canvasMode(), basil.js canvasMode seems to be messed up, please use one of the following modes: b.PAGE, b.MARGIN, b.BLEED, b.FACING_PAGES, b.FACING_MARGINS, b.FACING_BLEEDS");
      break;
  }

  if(singlePageMode) {
    var w = pageBounds[3] - pageBounds[1] + widthOffset;
    var h = pageBounds[2] - pageBounds[0] + heightOffset;

    pub.width = $.global.width = w;
    pub.height = $.global.height = h;
  }
};

var createSelectionDialog = function(settings) {
  var result;
  if(!settings) {
    settings = {};
  }

  // set settings object to given values or defaults
  settings.prompt = settings.hasOwnProperty("prompt") ? settings.prompt : "";
  settings.filter = settings.hasOwnProperty("filter") ? settings.filter : [""];
  settings.folder = settings.hasOwnProperty("folder") ? settings.folder : currDialogFolder;
  settings.multiFile = settings.hasOwnProperty("multiFile") ? true : false;
  settings.folderSelect = settings.hasOwnProperty("folderSelect") ? true : false;

  if(!isString(settings.prompt)) {
    settings.prompt = "";
  }
  if(!isString(settings.filter) && !isArray(settings.filter)) {
    settings.filter = [""];
  }
  if(isString(settings.filter)) {
    settings.filter = [settings.filter];
  }
  if(isString(settings.folder)) {
    settings.folder = pub.folder(settings.folder);
  }
  if(!(settings.folder instanceof Folder) || !settings.folder.exists) {
    settings.folder = currDialogFolder;
  }

  if(settings.folderSelect) {
    result = Folder(settings.folder).selectDlg(settings.prompt);
  } else {
    function filterFiles(file){
      if (file instanceof Folder) { return true }
      for (var i = settings.filter.length - 1; i >= 0; i--) {
        if (isString(settings.filter[i]) && endsWith(file.name.toLowerCase(), settings.filter[i].toLowerCase())) { return true }
      }
      return false;
    }

    result = File(settings.folder).openDlg(settings.prompt, filterFiles, settings.multiFile);
  }

  if(result instanceof File) {
    currDialogFolder = result.parent;
  } else if (isArray(result)) {
    currDialogFolder = result[0].parent;
  } else if (result instanceof Folder) {
    currDialogFolder = result;
  }

  if(result === null && settings.multiFile) {
    result = [];
  }

  return result;
}

// internal helper to get a style by name, wether it is nested in a stlye group or not
var findInStylesByName = function(allStylesCollection, name) {
  for (var i = 0; i < allStylesCollection.length; i++) {
    if (allStylesCollection[i].name === name) {
      return allStylesCollection[i];
    }
  }
  return null;
};

// get the name of parent functions; helpful for more meaningful error messages
// level describes how many levels above to find the function whose function name is returned
var getParentFunctionName = function(level) {
    var stackArray = $.stack.
          replace(/\((.+?)\)/g, "").
          split(/[\n]/);
    return stackArray[stackArray.length - 2 - level];
}

var checkNull = function (obj) {
  if(obj === null || typeof obj === undefined) error("Received null object.");
};

var executionDuration = function() {
  var duration = pub.millis();
  return duration < 1000 ? duration + "ms" : (duration / 1000).toPrecision(3) + "s";
}

var error = function(msg) {
  println(ERROR_PREFIX + msg);
  throw new Error(ERROR_PREFIX + msg);
};

var warning = function(msg) {
  println(WARNING_PREFIX + msg);
};

var clearConsole = function() {
  var bt = new BridgeTalk();
  bt.target = "estoolkit";
  bt.body = "app.clc()"; // works just with cs6
  bt.onError = function(errObj) {};
  bt.onResult = function(resObj) {};
  bt.send();
};

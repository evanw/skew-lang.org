(function() {

  function ApiWorker() {
    var self = this;

    self.thread = new Worker('skew-api.min.js');
    self.isBusy = false;
    self.pendingCompileMessage = null;
    self.pendingTooltipQueryMessage = null;
    self.previousTooltipQueryJSON = null;
    self.onCompile = null;
    self.onTooltipQuery = null;

    self.thread.onmessage = function(e) {
      if (self.pendingCompileMessage) {
        self.previousTooltipQueryJSON = null;
        self.thread.postMessage(self.pendingCompileMessage);
        self.pendingCompileMessage = null;
        return;
      }

      if (self.pendingTooltipQueryMessage) {
        if (self.previousTooltipQueryJSON !== JSON.stringify(self.pendingTooltipQueryMessage)) {
          self.previousTooltipQueryJSON = JSON.stringify(self.pendingTooltipQueryMessage);
          self.thread.postMessage(self.pendingTooltipQueryMessage);
          self.pendingTooltipQueryMessage = null;
          return;
        }
        self.pendingTooltipQueryMessage = null;
      }

      self.isBusy = false;

      switch (e.data.type) {
        case 'compile': {
          if (self.onCompile) {
            self.onCompile(e.data);
          }
          break;
        }

        case 'tooltip-query': {
          if (self.onTooltipQuery) {
            self.onTooltipQuery(e.data);
          }
          break;
        }
      }
    };
  }

  ApiWorker.prototype.compileAsync = function(message) {
    if (this.isBusy) {
      this.pendingCompileMessage = message;
    } else {
      this.isBusy = true;
      this.previousTooltipQueryJSON = null;
      this.thread.postMessage(message);
    }
  };

  ApiWorker.prototype.queryTooltipAsync = function(message) {
    if (this.isBusy) {
      this.pendingTooltipQueryMessage = message;
    } else if (this.previousTooltipQueryJSON !== JSON.stringify(message)) {
      this.isBusy = true;
      this.previousTooltipQueryJSON = JSON.stringify(message);
      this.thread.postMessage(message);
    }
  };

  function BaseMode() {
  }

  BaseMode.prototype.createWorker = function() {
  };

  BaseMode.prototype.transformAction = function() {
  };

  BaseMode.prototype.checkOutdent = function(state, line, input) {
    if (!/^\s+$/.test(line)) {
      return false; // Early-out if there's no indent to remove
    }
    return /^\s*}/.test(input);
  };

  BaseMode.prototype.autoOutdent = function(state, session, row) {
    var line = session.getLine(row);
    var closingBrace = /^(?:\s*})/.exec(line);
    if (!closingBrace) {
      return;
    }

    var column = closingBrace[0].length;
    var openingBrace = session.findMatchingBracket({row: row, column: column});
    if (!openingBrace || openingBrace.row === row) {
      return;
    }

    var range = {start: {row: row, column: 0}, end: {row: row, column: column - 1}};
    var indent = /^\s*/.exec(session.getLine(openingBrace.row))[0];
    session.doc.replace(range, indent);
  };

  BaseMode.prototype.getNextLineIndent = function(state, line, tab) {
    var indent = /^\s*/.exec(line)[0];
    if (/^.*[{(\[]\s*$/.exec(line)) {
      indent += tab;
    }
    return indent;
  };

  function SkewMode() {
    this.diagnosticsByLine = {};
  }

  SkewMode.prototype = new BaseMode;

  SkewMode.prototype.getTokenizer = function() {
    var isEntityKeyword = /^(?:catch|class|const|def|enum|flags|for|interface|namespace|over|var)$/;
    var isKeyword = /^(?:as|break|case|catch|class|const|continue|def|default|else|enum|flags|finally|for|if|in|interface|is|namespace|over|return|switch|throw|try|type|var|while|@[A-Za-z_][A-Za-z0-9_]*)$/;
    var isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var isWhitespace = /^\s+$/;
    var isConstant = /^(?:true|false|null|self|super|_?[A-Z][A-Z0-9_]+)$/;
    var isNumber = /^(?:\d+\.\d+[eE][-+]?\d+|\d+\.\d+|0b[0-1]+|0o[0-7]+|0x[A-Fa-f0-9]+|\d+[eE][-+]?\d+|\d+|'.*)$/;
    var isType = /^(?:int|string|double|bool|fn|_?[A-Z][A-Za-z0-9_]*)$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /((?:@|\b)[A-Za-z_][A-Za-z0-9_]*\b|#.*|\d+\.\d+[eE][-+]?\d+|\d+\.\d+|0b[0-1]+|0o[0-7]+|0x[A-Fa-f0-9]+|\d+[eE][-+]?\d+|\d+|"|'(?:[^'\\]|\\.)*')/g;
        var inStringRegex = /("|(?:[^"\\]|\\.)+)/g;
        var tokens = [];
        var previous = 0;
        var wasEntityKeyword = false;

        while (true) {
          var currentRegex = state === 'string' ? inStringRegex : regex;
          currentRegex.lastIndex = previous;
          var match = currentRegex.exec(line);
          if (!match) {
            break;
          }

          if (previous < match.index) {
            tokens.push({
              type: 'text',
              value: line.slice(previous, match.index),
            });
          }

          var value = match[0];

          tokens.push({
            type:
              state === 'string' ? 'string' :
              value[0] === '#' ? 'comment' :
              value[0] === '"' ? 'string' :
              value === 'type' ? 'text' :
              isKeyword.test(value) ? 'keyword' :
              wasEntityKeyword && isIdentifier.test(value) ? 'entity' :
              isConstant.test(value) ? 'constant' :
              isNumber.test(value) ? 'number' :
              isType.test(value) ? 'type' :
              'text',
            value: value,
          });

          // The "type" keyword is contextual
          var length = tokens.length;
          if (isIdentifier.test(value) && length >= 3 && isWhitespace.test(tokens[length - 2].value) && tokens[length - 3].value === 'type') {
            tokens[length - 3].type = 'keyword';
          }

          if (value === '"') {
            state = state === 'string' ? null : 'string';
          }
          wasEntityKeyword = isEntityKeyword.test(value);
          previous = match.index + value.length;
        }

        if (previous < line.length) {
          tokens.push({
            type: 'text',
            value: line.slice(previous),
          });
        }

        var diagnostics = self.diagnosticsByLine[row];
        if (diagnostics) {
          var column = 0;
          for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i];
            for (var j = 0; j < diagnostics.length; j++) {
              var diagnostic = diagnostics[j];
              var range = diagnostic.range;
              var start = range.start.column - column;
              var end = start + (range.end.line === range.start.line ? range.end.column : line.length) - range.start.column;

              // Skip if this token doesn't overlap this diagnostic
              if (start >= token.value.length || end <= 0) {
                continue;
              }

              // Split off the uncovered bit at the start
              if (start > 0) {
                tokens.splice(i++, 0, {
                  type: token.type,
                  value: token.value.slice(0, start)
                });
              }

              // Split off the uncovered bit at the end
              if (end < token.value.length) {
                tokens.splice(i + 1, 0, {
                  type: token.type,
                  value: token.value.slice(end)
                });
              }

              // Add the error type to the covered bit
              var from = Math.max(start, 0);
              var to = Math.min(end, token.value.length);
              token.value = token.value.slice(from, to);
              token.type += '.' + diagnostic.kind;
              column += from;
            }

            column += token.value.length;
          }

          // Add diagnostics at the end to an extra space at the end of the line
          var diagnostic = diagnostics[diagnostics.length - 1];
          if (diagnostic.range.start.column === line.length) {
            tokens.push({
              type: diagnostic.kind,
              value: ' ',
            });
          }
        }

        return {
          state: state,
          tokens: tokens,
        };
      },
    };
  };

  function getJavaScriptTokenizer() {
    var isKeyword = /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|finally|for|function|if|import|in|instanceof|let|new|return|super|switch|throw|try|typeof|var|void|while|with|yield)$/;
    var isConstant = /^(?:true|false|null|this|_?[A-Z][A-Z0-9_]+)$/;
    var isNumber = /^(?:[-+]?\d*\.?\d+([eE][-+]?\d+)?)$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[-+]?\d*\.?\d+([eE][-+]?\d+)?)/g;
        var tokens = [];
        var previous = 0;

        while (true) {
          regex.lastIndex = previous;
          var match = regex.exec(line);
          if (!match) {
            break;
          }

          if (previous < match.index) {
            tokens.push({
              type: 'text',
              value: line.slice(previous, match.index),
            });
          }

          var value = match[0];

          tokens.push({
            type:
              value.slice(0, 2) === '//' ? 'comment' :
              '\'"'.indexOf(value[0]) >= 0 ? 'string' :
              isKeyword.test(value) ? 'keyword' :
              isConstant.test(value) ? 'constant' :
              isNumber.test(value) ? 'number' :
              'text',
            value: value,
          });

          previous = match.index + value.length;
        }

        if (previous < line.length) {
          tokens.push({
            type: 'text',
            value: line.slice(previous),
          });
        }

        return {
          state: null,
          tokens: tokens,
        };
      },
    };
  }

  function getAssemblyTokenizer() {
    var isKeyword = /^(?:add|and|imul|mov|sar|shr)$/;
    var isRegister = /^(?:eax|ecx)$/;
    var isNumber = /^(?:(?:0x)?[0-9A-Fa-f]+)$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|;.*|(?:0x)?[0-9A-Fa-f]+)/g;
        var tokens = [];
        var previous = 0;

        var match = /^\w+\s+\w+\s+/.exec(line);
        if (match) {
          previous = match[0].length;
          tokens.push({
            type: 'text',
            value: line.slice(0, previous),
          });
        }

        while (true) {
          regex.lastIndex = previous;
          var match = regex.exec(line);
          if (!match) {
            break;
          }

          if (previous < match.index) {
            tokens.push({
              type: 'text',
              value: line.slice(previous, match.index),
            });
          }

          var value = match[0];

          tokens.push({
            type:
              value[0] === ';' ? 'comment' :
              isKeyword.test(value) ? 'keyword' :
              isRegister.test(value) ? 'constant' :
              isNumber.test(value) ? 'number' :
              'text',
            value: value,
          });

          previous = match.index + value.length;
        }

        if (previous < line.length) {
          tokens.push({
            type: 'text',
            value: line.slice(previous),
          });
        }

        return {
          state: null,
          tokens: tokens,
        };
      },
    };
  }

  function getCSharpTokenizer() {
    var isKeyword = /^(?:abstract|as|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|throw|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while)$/;
    var isConstant = /^(?:true|false|null|this|base|_?[A-Z][A-Z0-9_]+)$/;
    var isNumber = /^(?:[-+]?\d*\.?\d+([eE][-+]?\d+)?)$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|"(?:[^"\\]|\\.)*"|[-+]?\d*\.?\d+([eE][-+]?\d+)?)/g;
        var tokens = [];
        var previous = 0;

        while (true) {
          regex.lastIndex = previous;
          var match = regex.exec(line);
          if (!match) {
            break;
          }

          if (previous < match.index) {
            tokens.push({
              type: 'text',
              value: line.slice(previous, match.index),
            });
          }

          var value = match[0];

          tokens.push({
            type:
              value.slice(0, 2) === '//' ? 'comment' :
              value[0] === '"' ? 'string' :
              isKeyword.test(value) ? 'keyword' :
              isConstant.test(value) ? 'constant' :
              isNumber.test(value) ? 'number' :
              'text',
            value: value,
          });

          previous = match.index + value.length;
        }

        if (previous < line.length) {
          tokens.push({
            type: 'text',
            value: line.slice(previous),
          });
        }

        return {
          state: null,
          tokens: tokens,
        };
      },
    };
  }

  function loadTooltips() {
    var timeout = 0;
    var isVisible = false;
    var tooltip = document.createElement('div');
    var latestQueryPosition = null;
    var tooltipRange = null;

    function showTooltip(line, column, html) {
      clearTimeout(timeout);
      var renderer = editor.renderer;
      var x = renderer.gutterWidth + renderer.$padding + Math.round(column * renderer.characterWidth) - renderer.scrollLeft;
      var y = (line + 1) * renderer.lineHeight - renderer.scrollTop;
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      isVisible = true;
    }

    function hideTooltip() {
      clearTimeout(timeout);
      if (!isVisible) return;
      tooltip.style.display = 'none';
      isVisible = false;
      tooltipRange = null;
    }

    function isPositionInRange(position, range) {
      var start = range.start.column;
      var end = range.end.line === range.start.line ? range.end.column : editor.session.getLine(range.start.line).length;
      return position.row === range.start.line && position.column >= start && position.column <= end;
    }

    function checkTooltip(e) {
      var renderer = editor.renderer;
      var position = renderer.pixelToScreenCoordinates(e.clientX, e.clientY);

      if (tooltipRange !== null && isPositionInRange(position, tooltipRange)) {
        return;
      }

      hideTooltip();

      // Only attempt to show a type tooltip if the mouse is still
      timeout = setTimeout(function() {
        latestQueryPosition = position;
        tooltipWorker.queryTooltipAsync({
          type: 'tooltip-query',
          source: '<stdin>',
          line: position.row,
          column: position.column,
        });
      }, isVisible ? 0 : 250);
    }

    tooltipWorker.onTooltipQuery = function(data) {
      tooltipRange = null;
      if (data.tooltip !== null && isPositionInRange(latestQueryPosition, data.range)) {
        tooltipRange = data.range;
        showTooltip(tooltipRange.start.line, tooltipRange.start.column,
          data.symbol !== null ? tokenizeToHTML(skewTokenizer, data.tooltip) : escapeForHTML(data.tooltip));
      }
    };

    tooltip.className = 'ace_tooltip';
    document.querySelector('#editor').appendChild(tooltip);
    document.addEventListener('mousemove', checkTooltip);
    editor.session.on('changeScrollLeft', hideTooltip);
    editor.session.on('changeScrollTop', hideTooltip);
  }

  function renderExpandables() {
    // This uses <button> instead of <a> because people try to open links in
    // a new tab. Using buttons avoids this while still being accessible.
    forEach.call(document.querySelectorAll('.expand'), function(element) {
      var isVisible = false;
      var reveal = element.nextElementSibling;
      var style = reveal.style;
      var sourceHeight = 0;
      var targetHeight = 0;
      var animationStart = 0;
      var animationDuration = 0;

      // Use custom animation callbacks because CSS transitions are too broken and cross-browser incompatible
      animationCallbacks.push(function() {
        if (sourceHeight !== targetHeight) {
          var t = (now() - animationStart) / animationDuration;
          if (t > 1) {
            sourceHeight = targetHeight;
            t = 1;
          }
          t = 1 - t;
          t *= t * t;
          t = 1 - t;
          style.height = Math.round(sourceHeight + (targetHeight - sourceHeight) * t) + 'px';
        }
      });

      // Prepare for a slide-down animation
      style.display = 'block';
      style.height = 0;

      element.onmousedown = function(e) {
        e.preventDefault();
      };

      element.onclick = function() {
        isVisible = !isVisible;

        // Measure the height
        style.transition = 'none';
        style.height = 'auto';
        var height = reveal.clientHeight;

        // Animate from the old state to the new state
        sourceHeight = isVisible ? 0 : height;
        targetHeight = isVisible ? height : 0;
        animationStart = now();
        animationDuration = 250 + Math.min(1, height / 1000) * 200;
        style.height = sourceHeight + 'px';
        element.style.transition = element.parentNode.style.transition = 'all ' + animationDuration / 1000 + 's';
        element.parentNode.classList.toggle('expanded', isVisible);
      };
    });
  }

  function escapeForHTML(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  }

  function tokenizeToHTML(tokenizer, text) {
    var state;
    return text.split('\n').map(function(line, i) {
      var result = tokenizer.getLineTokens(line, state, i);
      state = result.state;
      return result.tokens.map(function(token) {
        var text = escapeForHTML(token.value);
        return token.type === 'text' ? text : '<span class="' + token.type.split('.').map(function(name) {
          return 'ace_' + name;
        }).join(' ') + '">' + text + '</span>';
      }).join('');
    }).join('\n');
  }

  function now() {
    return window.performance && performance.now ? performance.now() : +new Date;
  }

  function animate() {
    for (var i = 0; i < animationCallbacks.length; i++) {
      animationCallbacks[i]();
    }
    requestAnimationFrame(animate);
  }

  // Set up smooth scrolling for all internal links
  function renderSmoothScrolling() {
    var animateScrolling = null;
    forEach.call(document.querySelectorAll('a'), function(link) {
      var hash = /#(.*)$/.exec(link.href);
      if (!hash) return;
      link.onmousedown = function(e) {
        e.stopPropagation();
      };
      link.onclick = link.ontouchend = function(e) {
        if (isLiveEditorOpen) {
          toggleLiveEditor();
        }
        var endY = 0;
        for (var element = document.getElementById(hash[1]); element !== null; element = element.offsetParent) {
          endY += element.offsetTop;
        }
        var startY = window.pageYOffset || document.body.scrollTop || document.documentElement.scrollTop;
        var startTime = now();
        if (startY !== endY) {
          animateScrolling = function() {
            var t = Math.min(1, (now() - startTime) / 500);
            t = 0.5 - 0.5 * Math.cos(t * Math.PI);
            t = 0.5 - 0.5 * Math.cos(t * Math.PI);
            window.scrollTo(0, Math.round(startY + (endY - startY) * t));
            if (t === 1) animateScrolling = null;
          };
        }
        e.preventDefault();
      };
    });
    animationCallbacks.push(function() {
      if (animateScrolling) animateScrolling();
    });
  }

  function update() {
    translationWorker.compileAsync({
      type: 'compile',
      target: currentTarget,
      release: isRelease,
      inputs: [{
        name: '<stdin>',
        contents: editor.getValue(),
      }],
    });

    tooltipWorker.compileAsync({
      type: 'compile',
      target: currentTarget,
      stopAfterResolve: true,
      defines: {
        RELEASE: isRelease.toString(),
      },
      inputs: [{
        name: '<stdin>',
        contents: editor.getValue(),
      }],
    });
  }

  function renderCharacterWrapHack() {
    // Make the text wrap at the character level instead of the word level in
    // release. Why the hell is this browser specific? Isn't this supposed to
    // be standardized?
    var style = document.createElement('style');
    if (/\bChrome\b/.test(navigator.userAgent) || /\bApple\b/.test(navigator.vendor)) {
      style.textContent = '.character-wrap{white-space:pre!important;word-break:break-word;}';
    } else if (/\bFirefox\b/.test(navigator.userAgent)) {
      style.textContent = '.character-wrap{white-space:pre-wrap!important;word-break:break-word;word-break:break-all;}';
    }
    document.head.appendChild(style);
  }

  function renderEditor() {
    // Ace really doesn't work on mobile, so don't give mobile users an interactive experience
    if (/mobi/i.test(navigator.userAgent)) {
      return;
    }

    ace.require('ace/commands/default_commands').commands.forEach(function(command) {
      if (command.name === 'gotoline') {
        command.bindKey = {
          win: 'Ctrl-Shift-L',
          mac: 'Ctrl-L',
        };
      }
    });

    editor = ace.edit('editor');
    editor.$blockScrolling = Infinity;
    editor.renderer.setDisplayIndentGuides(false);
    editor.renderer.setPadding(0);
    editor.renderer.setShowGutter(false);
    editor.session.setMode(skewMode);
    editor.session.setTabSize(2);
    editor.setHighlightActiveLine(false);
    editor.setShowFoldWidgets(false);
    editor.setShowPrintMargin(false);
    editor.on('change', update);
    loadCode(code['sparks']);
    loadTooltips();
  }

  function renderSyntaxHighlighting() {
    forEach.call(document.querySelectorAll('.skew'), function(element) {
      var text = element.dataset.content && code[element.dataset.content] || element.textContent;
      element.innerHTML = tokenizeToHTML(skewTokenizer, text);

      if (!element.dataset.noload && !isMobile) {
        var div = document.createElement('div');
        div.onclick = function() {
          if (!isLiveEditorOpen) toggleLiveEditor();
          loadCode(text);
        };
        div.className = 'button';
        div.textContent = 'Load';
        element.appendChild(div);
      }
    });

    forEach.call(document.querySelectorAll('.js'), function(element) {
      element.innerHTML = tokenizeToHTML(jsTokenizer, element.textContent);
    });

    forEach.call(document.querySelectorAll('.asm'), function(element) {
      element.innerHTML = tokenizeToHTML(asmTokenizer, element.textContent);
    });
  }

  function loadCode(text) {
    editor.setValue(text);
    editor.focus();
    editor.selection.moveTo(0, 0);
    editor.session.setScrollLeft(0);
    editor.session.setScrollTop(0);
    output.textContent = '';
  }

  function renderDropdown(element) {
    var isOpen = false;
    var menu = element.nextElementSibling;

    element.onclick = function() {
      isOpen = !isOpen;
      element.parentNode.classList.toggle('open', isOpen);
      if (isOpen) {
        element.focus();
      }
    };

    element.onblur = function() {
      if (isOpen) {
        element.onclick();
      }
    };

    menu.onmousedown = function(e) {
      e.preventDefault();
    };

    menu.onclick = function(e) {
      if (e.target.dataset.load in code) {
        loadCode(code[e.target.dataset.load]);
        element.blur();
      }

      else if (e.target.dataset.target) {
        document.querySelector('#target-button span').textContent = e.target.textContent;
        currentTarget = e.target.dataset.target;
        isRelease = !!e.target.dataset.release;
        update();
        element.blur();
      }
    };
  }

  toggleSection = function(className) {
    var all = Array.prototype.slice.call(document.querySelectorAll('.' + className + ' .expandable'));
    var isAllExpanded = all.every(function(e) { return e.classList.contains('expanded'); });

    all.forEach(function(e) {
      if (isAllExpanded || !e.classList.contains('expanded')) {
        e.querySelector('.expand').click();
      }
    });
  };

  var forEach = Array.prototype.forEach;
  var code = {
    'raytracer': '# This is a rough port of the raytracer example\n# from http://www.typescriptlang.org/Playground\n\nnamespace Math {\n  def trunc(x double) int {\n    return x as int\n  }\n}\n\ndef render(width int, height int, pixels Float32Array, weight double) {\n  var scene = Scene.new(\n    Camera.new(Vector.new(3, 2, 4),\n    Vector.new(-1, 0.5, 0)))\n\n  scene.elements = [\n    Plane.new(Checkerboard.new, Vector.new(0, 1, 0), 0),\n    Sphere.new(Shiny.new, Vector.new(0, 1, -0.25), 1),\n    Sphere.new(Shiny.new, Vector.new(-1, 0.5, 1.5), 0.5),\n  ]\n\n  scene.lights = [\n    Light.new(\n      Vector.new(-2, 2.5, 0),\n      Vector.new(0.49, 0.07, 0.07)),\n    Light.new(\n      Vector.new(1.5, 2.5, 1.5),\n      Vector.new(0.07, 0.07, 0.49)),\n    Light.new(\n      Vector.new(1.5, 2.5, -1.5),\n      Vector.new(0.07, 0.49, 0.071)),\n    Light.new(\n      Vector.new(0, 3.5, 0),\n      Vector.new(0.21, 0.21, 0.35)),\n  ]\n\n  var shiftX = Math.random\n  var shiftY = Math.random\n  var i = 0\n  for y in 0..height {\n    var screenY = ((y + shiftY) * 2 - height) / width\n    for x in 0..width {\n      var screenX = ((x + shiftX) * 2 - width) / width\n      var color = scene.trace2D(screenX, -screenY)\n      var r = pixels[i]\n      var g = pixels[i + 1]\n      var b = pixels[i + 2]\n      pixels[i]     = r + (color.x - r) * weight\n      pixels[i + 1] = g + (color.y - g) * weight\n      pixels[i + 2] = b + (color.z - b) * weight\n      i += 3\n    }\n  }\n}\n\nclass Vector {\n  const x double\n  const y double\n  const z double\n\n  def *(s double) Vector {\n    return Vector.new(x * s, y * s, z * s)\n  }\n\n  def /(s double) Vector {\n    return self * (1 / s)\n  }\n\n  def +(v Vector) Vector {\n    return Vector.new(x + v.x, y + v.y, z + v.z)\n  }\n\n  def -(v Vector) Vector {\n    return Vector.new(x - v.x, y - v.y, z - v.z)\n  }\n\n  def *(v Vector) Vector {\n    return Vector.new(x * v.x, y * v.y, z * v.z)\n  }\n\n  def cross(v Vector) Vector {\n    return Vector.new(\n      y * v.z - z * v.y,\n      z * v.x - x * v.z,\n      x * v.y - y * v.x)\n  }\n\n  def dot(v Vector) double {\n    return x * v.x + y * v.y + z * v.z\n  }\n\n  def length double {\n    return Math.sqrt(dot(self))\n  }\n\n  def unit Vector {\n    return self / length\n  }\n\n  def reflectAbout(n Vector) Vector {\n    return self - n * (2 * dot(n))\n  }\n}\n\nnamespace Colors {\n  const WHITE = Vector.new(1, 1, 1)\n  const BLACK = Vector.new(0, 0, 0)\n  const GRAY = Vector.new(0.5, 0.5, 0.5)\n}\n\nclass Light {\n  var point Vector\n  var color Vector\n}\n\nclass Intersection {\n  var t double\n  var element Element\n}\n\nclass SurfaceInfo {\n  var diffuse Vector\n  var specular Vector\n  var reflect double\n  var roughness double\n}\n\ninterface Surface {\n  def infoAt(point Vector) SurfaceInfo\n}\n\nclass Checkerboard :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    if ((Math.trunc(point.x) ^ Math.trunc(point.z)) & 1) != 0 {\n      return WHITE_INFO\n    }\n    return BLACK_INFO\n  }\n}\n\nnamespace Checkerboard {\n  const WHITE_INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.WHITE, 0.1, 150)\n  const BLACK_INFO = SurfaceInfo.new(\n    Colors.BLACK, Colors.WHITE, 0.7, 150)\n}\n\nclass Shiny :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    return INFO\n  }\n}\n\nnamespace Shiny {\n  const INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.GRAY, 0.7, 250)\n}\n\nclass Element {\n  var surface Surface\n\n  def intersect(origin Vector, ray Vector) Intersection\n  def normalAt(point Vector) Vector\n}\n\nclass Plane : Element {\n  var normal Vector\n  var offset double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var t = -(normal.dot(origin) + offset) / normal.dot(ray)\n    if t > 0 {\n      return Intersection.new(t, self)\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return Vector.new(0, 1, 0)\n  }\n}\n\nclass Sphere : Element {\n  var center Vector\n  var radius double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var offset = origin - center\n    var a = ray.dot(ray)\n    var b = 2 * ray.dot(offset)\n    var c = offset.dot(offset) - radius * radius\n    var discriminant = b * b - 4 * a * c\n    if discriminant > 0 {\n      var t = (-b - Math.sqrt(discriminant)) / (2 * a)\n      if t > 0 {\n        return Intersection.new(t, self)\n      }\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return (point - center) / radius\n  }\n}\n\nclass Camera {\n  var point Vector\n  var forward Vector\n  var right Vector\n  var up Vector\n\n  def new(point Vector, lookAt Vector) {\n    self.point = point\n    forward = (lookAt - point).unit\n    right = forward.cross(Vector.new(0, -1, 0)).unit\n    up = forward.cross(right).unit\n  }\n}\n\nclass Scene {\n  var elements List<Element> = []\n  var lights List<Light> = []\n  var camera Camera\n\n  def intersect(origin Vector, ray Vector, ignore Element) Intersection {\n    var closest Intersection = null\n    for element in elements {\n      if element != ignore {\n        var hit = element.intersect(origin, ray)\n        if hit != null && (closest == null || hit.t < closest.t) {\n          closest = hit\n        }\n      }\n    }\n    return closest\n  }\n\n  def trace3D(origin Vector, ray Vector, ignore Element, depth int) Vector {\n    var hit = intersect(origin, ray, ignore)\n    if hit == null {\n      return Colors.BLACK\n    }\n\n    var point = origin + ray * hit.t\n    var normal = hit.element.normalAt(point)\n    var reflected = ray.reflectAbout(normal)\n    var info = hit.element.surface.infoAt(point)\n    var color = Colors.BLACK\n\n    for light in lights {\n      var delta = light.point - point\n\n      var shadow = intersect(point, delta, hit.element)\n      if shadow != null && shadow.t < 1 {\n        continue\n      }\n      delta = delta.unit\n\n      # Diffuse\n      var weight = Math.max(0, delta.dot(normal))\n      color += light.color * info.diffuse * weight\n\n      # Specular\n      weight = Math.pow(Math.max(0, delta.dot(reflected)), info.roughness)\n      color += light.color * info.specular * weight\n    }\n\n    # Reflection\n    if depth > 0 {\n      color += trace3D(point, reflected, hit.element, depth - 1) * info.reflect\n    }\n\n    return color\n  }\n\n  def trace2D(x double, y double) Vector {\n    var ray = camera.forward + camera.right * x + camera.up * y\n    return trace3D(camera.point, ray.unit, null, 5)\n  }\n}\n\ndef pack(r double, g double, b double) int {\n  return\n    clamp(r) |\n    clamp(g) << 8 |\n    clamp(b) << 16 |\n    0xFF000000\n}\n\ndef clamp(x double) int {\n  if x < 0 { return 0 }\n  if x >= 1 { return 255 }\n  return Math.trunc(256 * x)\n}\n\n@entry\ndef main {\n  var width = 640\n  var height = 480\n  var pixels = Float32Array.new(width * height * 3)\n  var canvas = document.createElement("canvas")\n  var context = canvas.getContext("2d")\n  var imageData = context.createImageData(width, height)\n  var data = Int32Array.new(imageData.data.buffer)\n  canvas.width = width\n  canvas.height = height\n  document.body.appendChild(canvas)\n\n  # Render in multiple passes to refine the image\n  var count = 0\n  var pass fn() = => {\n    render(width, height, pixels, 1 - count / (count + 1.0))\n    var j = 0\n    for i in 0..width * height {\n      data[i] = pack(pixels[j], pixels[j + 1], pixels[j + 2])\n      j += 3\n    }\n    context.putImageData(imageData, 0, 0)\n    if count < 16 {\n      count++\n      requestAnimationFrame(pass)\n    }\n  }\n  pass()\n}\n\n@import\nclass Int32Array {\n  def new(length int)\n  def [](index int) int\n  def []=(index int, value int)\n}\n\n@import\nclass Float32Array {\n  def new(length int)\n  def [](index int) double\n  def []=(index int, value double)\n}\n\n@import {\n  var document dynamic\n  def requestAnimationFrame(callback fn())\n}\n',
    'sparks': '@entry\ndef main {\n  var canvas = document.createElement("canvas")\n  var context = canvas.getContext("2d")\n  var sparks List<Spark> = []\n\n  var tick fn() = => {\n    canvas.width = 640\n    canvas.height = 480\n    canvas.style.background = "#EEE"\n    context.textAlign = "center"\n    context.fillText("Move the mouse!", 320, 240)\n    context.beginPath()\n    sparks.removeIf(s => {\n      s.x += s.vx / 2\n      s.y += s.vy / 2\n      s.vy += 3\n      s.time -= 1.0 / 60\n      context.moveTo(s.x, s.y)\n      context.lineTo(s.x + s.vx, s.y + s.vy)\n      return s.time < 0\n    })\n    context.stroke()\n    requestAnimationFrame(tick)\n  }\n\n  document.onmousemove = e => {\n    sparks.append(Spark.new(\n      e.pageX - canvas.offsetLeft,\n      e.pageY - canvas.offsetTop))\n  }\n\n  document.body.appendChild(canvas)\n  tick()\n}\n\nclass Spark {\n  var x double\n  var y double\n  var vx = Math.random * 20 - 10\n  var vy = Math.random * -40\n  var time = 1.0\n}\n\n@import {\n  const document dynamic\n  def requestAnimationFrame(callback fn())\n}\n',
    'webgl': '@entry\ndef main {\n  var width = 640\n  var height = 480\n  var doc = dynamic.document\n  var canvas = doc.createElement("canvas")\n  var gl = canvas.getContext("experimental-webgl")\n  var program = gl.createProgram()\n  var buffer = gl.createBuffer()\n  var vertices = dynamic.Float32Array.new([-1, -1, 3, -1, -1, 3])\n\n  var tick fn() = => {\n    gl.viewport(0, 0, width, height)\n    gl.uniform1f(gl.getUniformLocation(program, "t"), dynamic.performance.now() / 1000)\n    gl.drawArrays(gl.TRIANGLES, 0, 3)\n    dynamic.requestAnimationFrame(tick)\n  }\n\n  var compileShader = (kind int, source string) => {\n    var shader = gl.createShader(kind)\n    gl.shaderSource(shader, source)\n    gl.compileShader(shader)\n    gl.attachShader(program, shader)\n  }\n\n  compileShader(gl.VERTEX_SHADER, "\n    attribute vec4 v;\n    void main() {\n      gl_Position = v;\n    }\n  ")\n\n  # "Creation" by Silexars: http://www.pouet.net/prod.php?which=57245\n  compileShader(gl.FRAGMENT_SHADER, "\n    precision mediump float;\n    uniform float t;\n    void main() {\n      vec3 c;\n      vec2 r = vec2(\\(width).0, \\(height).0);\n      float l, z = 4.0 + t;\n      for (int i = 0; i < 3; i++) {\n        vec2 uv, p = gl_FragCoord.xy / r;\n        uv = p;\n        p -= 0.5;\n        p.x *= r.x / r.y;\n        z += 0.07;\n        l = length(p);\n        uv += p / l * (sin(z) + 1.0) * abs(sin(l * 9.0 - z * 2.0));\n        c[i] = 0.01 / length(abs(mod(uv, 1.0) - 0.5));\n      }\n      gl_FragColor = vec4(c / l, 1.0);\n    }\n  ")\n\n  gl.linkProgram(program)\n  gl.useProgram(program)\n  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)\n  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)\n  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)\n  gl.enableVertexAttribArray(0)\n\n  doc.body.appendChild(canvas)\n  canvas.width = width\n  canvas.height = height\n  tick()\n}\n',
    'color': '# This demonstrates using type wrapping to make an efficient color API. Colors\n# are stored directly as 32-bit integers and don\'t cause any allocations.\ntype Color : int {\n  def r int {\n    return (self as int) >> 16 & 255\n  }\n\n  def g int {\n    return (self as int) >> 8 & 255\n  }\n\n  def b int {\n    return (self as int) & 255\n  }\n\n  def a int {\n    return (self as int) >>> 24\n  }\n\n  def withAlpha(a int) Color {\n    return new(r, g, b, a)\n  }\n\n  def toString string {\n    return "Color(\\(r), \\(g), \\(b), \\(a))"\n  }\n}\n\nnamespace Color {\n  const TRANSPARENT = new(0, 0, 0, 0)\n\n  const BLACK = new(0, 0, 0)\n  const WHITE = new(255, 255, 255)\n\n  const RED = hex(0xFF0000)\n  const GREEN = hex(0x00FF00)\n  const BLUE = hex(0x0000FF)\n\n  def new(r int, g int, b int) Color {\n    return new(r, g, b, 255)\n  }\n\n  def new(r int, g int, b int, a int) Color {\n    assert(r >= 0 && r <= 0xFF)\n    assert(g >= 0 && g <= 0xFF)\n    assert(b >= 0 && b <= 0xFF)\n    assert(a >= 0 && a <= 0xFF)\n    return (r << 16 | g << 8 | b | a << 24) as Color\n  }\n\n  def hex(rgb int) Color {\n    return hex(rgb, 255)\n  }\n\n  def hex(rgb int, a int) Color {\n    assert(rgb >= 0 && rgb <= 0xFFFFFF)\n    assert(a >= 0 && a <= 0xFF)\n    return (rgb | a << 24) as Color\n  }\n}\n\n# This API works well with inlining and constant folding in release mode\n@entry\ndef test {\n  var red Color = .RED\n  var green Color = .GREEN\n  var yellow = Color.new(red.r, green.g, 0).withAlpha(127)\n  document.write("yellow: \\(yellow)")\n}\n\n@import\nconst document dynamic\n',
    'color-snippet': 'type Color : int {\n  def r int { return ((self as int) >> 16) & 255 }\n  def g int { return ((self as int) >> 8) & 255 }\n  def b int { return (self as int) & 255 }\n  def a int { return (self as int) >>> 24 }\n\n  def opaque Color {\n    return new(r, g, b, 255)\n  }\n}\n\nnamespace Color {\n  def new(r int, g int, b int, a int) Color {\n    return (r << 16 | g << 8 | b | a << 24) as Color\n  }\n}\n\n@export\ndef isOrange(color Color) bool {\n  return color.opaque == Color.new(255, 127, 0, 255)\n}\n',
    'calculator-browser': '@entry\ndef main {\n  document.body.innerHTML = "In: <input><br>Out: <span>"\n  var input = document.querySelector("input")\n  var result = document.querySelector("span")\n\n  # This uses a condensed version of the Shunting Yard Algorithm\n  # (https://en.wikipedia.org/wiki/Shunting-yard_algorithm)\n  var compute = => {\n    var text string = input.value\n    var tokens = text.split(RegExp.new("(\\\\d+|[()+\\\\-*/])"))\n    var output List<double> = []\n    var stack List<int> = []\n    var priority = {\'+\': 1, \'-\': 1, \'*\': 2, \'/\': 2, \'(\': 3}\n    var binary = (callback fn(double, double) double) => {\n      var right = output.takeLast\n      var left = output.takeLast\n      output.append(callback(left, right))\n    }\n\n    # Get a lexer for free by using a capturing regex to split\n    # on the tokens we want to match and ignoring all of the\n    # even-numbered strings (everything between the tokens).\n    # Append a null character at the end as a sentinel value.\n    tokens.append("\\0")\n    for i in 0..tokens.count {\n      if i % 2 == 0 { continue }\n      var op = tokens[i][0]\n      switch op {\n        case \'+\', \'-\', \'*\', \'/\', \'(\', \')\', \'\\0\' {\n          var p = priority.get(op, 0)\n          while !stack.isEmpty && priority.get(stack.last, 3) > p {\n            switch stack.last {\n              case \'+\' { binary((a, b) => a + b) }\n              case \'-\' { binary((a, b) => a - b) }\n              case \'*\' { binary((a, b) => a * b) }\n              case \'/\' { binary((a, b) => a / b) }\n              case \'(\' { if op != \')\' { break } }\n              default { break }\n            }\n            if stack.takeLast == \'(\' { break }\n          }\n          if op != \')\' && op != \'\\0\' { stack.append(op) }\n        }\n        default { output.append(parseFloat(tokens[i])) }\n      }\n    }\n\n    result.textContent = output.first.toString\n  }\n\n  input.value = "(1 + 2) * 3"\n  input.oninput = compute\n  input.focus()\n  input.select()\n  compute()\n}\n\n@import {\n  const document dynamic\n  const RegExp dynamic\n\n  def parseFloat(text string) double\n}\n',
    'calculator-node': '@entry\ndef main {\n  var example = "(1 + 2) * 3"\n  var readline = require("readline").createInterface({\n    "input": process.stdin,\n    "output": process.stdout,\n  })\n\n  var question fn()\n  var answer = (text string) => {\n    var tokens = text.split(RegExp.new("(\\\\d+|[()+\\\\-*/])"))\n    var output List<double> = []\n    var stack List<int> = []\n    var priority = {\'+\': 1, \'-\': 1, \'*\': 2, \'/\': 2, \'(\': 3}\n    var binary = (callback fn(double, double) double) => {\n      var right = output.takeLast\n      var left = output.takeLast\n      output.append(callback(left, right))\n    }\n\n    tokens.append("\\0")\n    for i in 0..tokens.count {\n      if i % 2 == 0 { continue }\n      var op = tokens[i][0]\n      switch op {\n        case \'+\', \'-\', \'*\', \'/\', \'(\', \')\', \'\\0\' {\n          var p = priority.get(op, 0)\n          while !stack.isEmpty && priority.get(stack.last, 3) > p {\n            switch stack.last {\n              case \'+\' { binary((a, b) => a + b) }\n              case \'-\' { binary((a, b) => a - b) }\n              case \'*\' { binary((a, b) => a * b) }\n              case \'/\' { binary((a, b) => a / b) }\n              case \'(\' { if op != \')\' { break } }\n              default { break }\n            }\n            if stack.takeLast == \'(\' { break }\n          }\n          if op != \')\' && op != \'\\0\' { stack.append(op) }\n        }\n        default { output.append(parseFloat(tokens[i])) }\n      }\n    }\n\n    console.log("answer: \\(output.first)")\n    question()\n  }\n\n  question = => readline.question("> ", answer)\n  console.log("> " + example)\n  answer(example)\n}\n\n@import {\n  const console dynamic\n  const process dynamic\n  const RegExp dynamic\n\n  def parseFloat(text string) double\n  def require(name string) dynamic\n}\n',
    'calculator-csharp': '@entry\ndef main {\n  var example = "(1 + 2) * 3"\n  var question fn()\n  var answer = (text string) => {\n    var tokens List<string> = Regex.Split(text, "(\\\\d+|[()+\\\\-*/])").ToList()\n    var output List<double> = []\n    var stack List<int> = []\n    var priority = {\'+\': 1, \'-\': 1, \'*\': 2, \'/\': 2, \'(\': 3}\n    var binary = (callback fn(double, double) double) => {\n      var right = output.takeLast\n      var left = output.takeLast\n      output.append(callback(left, right))\n    }\n\n    tokens.append("\\0")\n    for i in 0..tokens.count {\n      if i % 2 == 0 { continue }\n      var op = tokens[i][0]\n      switch op {\n        case \'+\', \'-\', \'*\', \'/\', \'(\', \')\', \'\\0\' {\n          var p = priority.get(op, 0)\n          while !stack.isEmpty && priority.get(stack.last, 3) > p {\n            switch stack.last {\n              case \'+\' { binary((a, b) => a + b) }\n              case \'-\' { binary((a, b) => a - b) }\n              case \'*\' { binary((a, b) => a * b) }\n              case \'/\' { binary((a, b) => a / b) }\n              case \'(\' { if op != \')\' { break } }\n              default { break }\n            }\n            if stack.takeLast == \'(\' { break }\n          }\n          if op != \')\' && op != \'\\0\' { stack.append(op) }\n        }\n        default { output.append(Double.Parse(tokens[i])) }\n      }\n    }\n\n    Console.WriteLine("answer: \\(output.first)")\n    question()\n  }\n\n  question = => {\n    Console.Write("> ")\n    answer(Console.ReadLine())\n  }\n  Console.WriteLine("> " + example)\n  answer(example)\n}\n\n@import {\n  @using("System") {\n    const Console dynamic\n    const Double dynamic\n  }\n\n  @using("System.Text.RegularExpressions")\n  @using("System.Linq")\n  const Regex dynamic\n}\n',
  };
  var skewMode = new SkewMode;
  var skewTokenizer = skewMode.getTokenizer();
  var csharpTokenizer = getCSharpTokenizer();
  var jsTokenizer = getJavaScriptTokenizer();
  var asmTokenizer = getAssemblyTokenizer();
  var animationCallbacks = [];
  var isLiveEditorOpen = false;
  var editor = null;
  var translationWorker = new ApiWorker;
  var tooltipWorker = new ApiWorker;
  var output = document.querySelector('#editor-generated');
  var currentTarget = 'js';
  var isRelease = false;
  var isMobile = /Mobi/.test(navigator.userAgent);

  translationWorker.onCompile = function(data) {
    var html = escapeForHTML(data.log.text);
    var generated = data.outputs.length ? data.outputs[0].contents : '';

    if (generated) {
      html = tokenizeToHTML(currentTarget === 'js' ? jsTokenizer : csharpTokenizer, generated);
      if (isRelease) html = html.replace(/\n/g, '');
    }

    output.innerHTML = '<pre' + (isRelease && generated ? ' class="character-wrap"' : '') + '>' + html + '</pre>';

    var allDiagnostics = [];
    skewMode.diagnosticsByLine = {};
    data.log.diagnostics.forEach(function(diagnostic) {
      if (diagnostic.range === null) {
        return;
      }
      var start = diagnostic.range.start;
      var diagnostics = skewMode.diagnosticsByLine[start.line];
      if (!diagnostics) {
        diagnostics = [];
        allDiagnostics.push(diagnostics);
        skewMode.diagnosticsByLine[start.line] = diagnostics;
      }
      diagnostics.push(diagnostic);
    });
    allDiagnostics.forEach(function(diagnostics) {
      if (diagnostics.some(function(diagnostic) { return diagnostic.kind === 'error'; })) {
        for (var i = 0; i < diagnostics.length; i++) {
          if (diagnostics[i].kind === 'warning') {
            diagnostics.splice(i--, 1);
          }
        }
      }
    });

    // Force a mode update
    editor.session.$mode = null;
    editor.session.setMode(skewMode);

    var runButton = document.querySelector('#run-button');
    if (generated && currentTarget === 'js') {
      runButton.classList.remove('disabled');
      runButton.onclick = function() {
        var popup = open('', '', 'width=660, height=500');

        // Firefox bug: Need to wrap document.write() with document.open() and
        // document.close() or use of requestAnimationFrame() runs at 1fps.
        // More info: https://bugzilla.mozilla.org/show_bug.cgi?id=1224902
        popup.document.open();
        popup.document.write('<pre><script>' + generated + '</script></pre>');
        popup.document.close();
      };
    } else {
      runButton.classList.add('disabled');
      runButton.onclick = function() {
      };
    }
  };

  toggleLiveEditor = function() {
    // Unfortunately code editors don't work on mobile
    if (isMobile) {
      return;
    }

    isLiveEditorOpen = !isLiveEditorOpen;
    document.body.classList.toggle('live-editor-open', isLiveEditorOpen);

    if (isLiveEditorOpen) {
      editor.focus();
    } else if (document.activeElement) {
      document.activeElement.blur();
    }
  };

  onscroll = function() {
    document.querySelector('header').classList.toggle('logo', scrollY > 500 - 100);
    document.querySelector('header').classList.toggle('solid', scrollY > 500 - 50);
  };

  renderDropdown(document.querySelector('#example-button'));
  renderDropdown(document.querySelector('#target-button'));

  document.onkeydown = function(e) {
    if (e.which === 27 && isLiveEditorOpen) {
      toggleLiveEditor();
    }
  };

  renderEditor();
  renderCharacterWrapHack();
  renderSmoothScrolling();
  renderExpandables();
  renderSyntaxHighlighting();
  animate();
  onscroll();

})();

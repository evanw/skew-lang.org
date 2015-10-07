(function() {

  var EXAMPLE_RAYTRACER = '# This is a rough port of the raytracer example\n# from http://www.typescriptlang.org/Playground.\n# Drop the compiled output in the developer tools\n# console of an "about:blank" tab to render the\n# raytraced image. It\'ll take a little while\n# because the raytracer is designed to exercise\n# language features, not to be fast.\n\nnamespace Math {\n  def trunc(x double) int {\n    return x as int\n  }\n}\n\ndef render(width int, height int, pixels Int32Array) {\n  var scene = Scene.new(\n    Camera.new(Vector.new(3, 2, 4),\n    Vector.new(-1, 0.5, 0)))\n\n  scene.elements = [\n    Plane.new(\n      Checkerboard.new,\n      Vector.new(0, 1, 0),\n      0),\n    Sphere.new(\n      Shiny.new,\n      Vector.new(0, 1, -0.25),\n      1),\n    Sphere.new(\n      Shiny.new,\n      Vector.new(-1, 0.5, 1.5),\n      0.5),\n  ]\n\n  scene.lights = [\n    Light.new(\n      Vector.new(-2, 2.5, 0),\n      Vector.new(0.49, 0.07, 0.07)),\n    Light.new(\n      Vector.new(1.5, 2.5, 1.5),\n      Vector.new(0.07, 0.07, 0.49)),\n    Light.new(\n      Vector.new(1.5, 2.5, -1.5),\n      Vector.new(0.07, 0.49, 0.071)),\n    Light.new(\n      Vector.new(0, 3.5, 0),\n      Vector.new(0.21, 0.21, 0.35)),\n  ]\n\n  var i = 0\n  for y in 0..height {\n    var screenY = (y * 2.0 + 1 - height) / width\n    for x in 0..width {\n      var screenX = (x * 2.0 + 1 - width) / width\n      pixels[i] = scene.trace2D(screenX, -screenY).pack\n      i++\n    }\n  }\n}\n\nclass Vector {\n  const x double\n  const y double\n  const z double\n\n  def *(s double) Vector {\n    return Vector.new(x * s, y * s, z * s)\n  }\n\n  def /(s double) Vector {\n    return self * (1 / s)\n  }\n\n  def +(v Vector) Vector {\n    return Vector.new(x + v.x, y + v.y, z + v.z)\n  }\n\n  def -(v Vector) Vector {\n    return Vector.new(x - v.x, y - v.y, z - v.z)\n  }\n\n  def *(v Vector) Vector {\n    return Vector.new(x * v.x, y * v.y, z * v.z)\n  }\n\n  def cross(v Vector) Vector {\n    return Vector.new(\n      y * v.z - z * v.y,\n      z * v.x - x * v.z,\n      x * v.y - y * v.x)\n  }\n\n  def dot(v Vector) double {\n    return x * v.x + y * v.y + z * v.z\n  }\n\n  def length double {\n    return Math.sqrt(dot(self))\n  }\n\n  def unit Vector {\n    return self / length\n  }\n\n  def reflectAbout(n Vector) Vector {\n    return self - n * (2 * dot(n))\n  }\n\n  def pack int {\n    return\n      clamp(x) |\n      clamp(y) << 8 |\n      clamp(z) << 16 |\n      0xFF000000\n  }\n}\n\nnamespace Vector {\n  def clamp(x double) int {\n    if x < 0 { return 0 }\n    if x > 1 { return 255 }\n    return Math.trunc(255.999 * x)\n  }\n}\n\nnamespace Colors {\n  const WHITE = Vector.new(1, 1, 1)\n  const BLACK = Vector.new(0, 0, 0)\n  const GRAY = Vector.new(0.5, 0.5, 0.5)\n}\n\nclass Light {\n  var point Vector\n  var color Vector\n}\n\nclass Intersection {\n  var t double\n  var element Element\n}\n\nclass SurfaceInfo {\n  var diffuse Vector\n  var specular Vector\n  var reflect double\n  var roughness double\n}\n\ninterface Surface {\n  def infoAt(point Vector) SurfaceInfo\n}\n\nclass Checkerboard :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    if ((Math.trunc(point.x) ^ Math.trunc(point.z)) & 1) != 0 {\n      return WHITE_INFO\n    }\n    return BLACK_INFO\n  }\n}\n\nnamespace Checkerboard {\n  const WHITE_INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.WHITE, 0.1, 150)\n  const BLACK_INFO = SurfaceInfo.new(\n    Colors.BLACK, Colors.WHITE, 0.7, 150)\n}\n\nclass Shiny :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    return INFO\n  }\n}\n\nnamespace Shiny {\n  const INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.GRAY, 0.7, 250)\n}\n\nclass Element {\n  var surface Surface\n\n  def intersect(origin Vector, ray Vector) Intersection\n  def normalAt(point Vector) Vector\n}\n\nclass Plane : Element {\n  var normal Vector\n  var offset double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var t = -(normal.dot(origin) + offset) / normal.dot(ray)\n    if t > 0 {\n      return Intersection.new(t, self)\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return Vector.new(0, 1, 0)\n  }\n}\n\nclass Sphere : Element {\n  var center Vector\n  var radius double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var offset = origin - center\n    var a = ray.dot(ray)\n    var b = 2 * ray.dot(offset)\n    var c = offset.dot(offset) - radius * radius\n    var discriminant = b * b - 4 * a * c\n    if discriminant > 0 {\n      var t = (-b - Math.sqrt(discriminant)) / (2 * a)\n      if t > 0 {\n        return Intersection.new(t, self)\n      }\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return (point - center) / radius\n  }\n}\n\nclass Camera {\n  var point Vector\n  var forward Vector\n  var right Vector\n  var up Vector\n\n  def new(point Vector, lookAt Vector) {\n    self.point = point\n    forward = (lookAt - point).unit\n    right = forward.cross(Vector.new(0, -1, 0)).unit\n    up = forward.cross(right).unit\n  }\n}\n\nclass Scene {\n  var elements List<Element> = []\n  var lights List<Light> = []\n  var camera Camera\n\n  def intersect(origin Vector, ray Vector, ignore Element) Intersection {\n    var closest Intersection = null\n    for element in elements {\n      if element != ignore {\n        var hit = element.intersect(origin, ray)\n        if hit != null && (closest == null || hit.t < closest.t) {\n          closest = hit\n        }\n      }\n    }\n    return closest\n  }\n\n  def trace3D(origin Vector, ray Vector, ignore Element, depth int) Vector {\n    var hit = intersect(origin, ray, ignore)\n    if hit == null {\n      return Colors.BLACK\n    }\n\n    var point = origin + ray * hit.t\n    var normal = hit.element.normalAt(point)\n    var reflected = ray.reflectAbout(normal)\n    var info = hit.element.surface.infoAt(point)\n    var color = Colors.BLACK\n\n    for light in lights {\n      var delta = light.point - point\n\n      var shadow = intersect(point, delta, hit.element)\n      if shadow != null && shadow.t < 1 {\n        continue\n      }\n      delta = delta.unit\n\n      # Diffuse\n      var weight = Math.max(0, delta.dot(normal))\n      color = color + light.color * info.diffuse * weight\n\n      # Specular\n      weight = Math.pow(Math.max(0, delta.dot(reflected)), info.roughness)\n      color = color + light.color * info.specular * weight\n    }\n\n    # Reflection\n    if depth > 0 {\n      var recursive = trace3D(point, reflected, hit.element, depth - 1)\n      color = color + recursive * info.reflect\n    }\n\n    return color\n  }\n\n  def trace2D(x double, y double) Vector {\n    var ray = camera.forward + camera.right * x + camera.up * y\n    return trace3D(camera.point, ray.unit, null, 5)\n  }\n}\n\n@entry\ndef main {\n  var canvas = document.createElement("canvas")\n  var context = canvas.getContext("2d")\n  var width = 640\n  var height = 480\n  var imageData = context.createImageData(width, height)\n  canvas.width = width\n  canvas.height = height\n  render(width, height, Int32Array.new(imageData.data.buffer))\n  context.putImageData(imageData, 0, 0)\n  document.body.appendChild(canvas)\n}\n\n@import\nclass Int32Array {\n  def new(length int)\n  def []=(index int, value int)\n}\n\n@import\nvar document dynamic\n';
  var EXAMPLE_TYPE_WRAPPING = '# Type wrapping allows for objects to be implemented\n# directly in terms of other objects without any extra\n# allocation at runtime. Here a 32-bit integer is\n# wrapped in a nice object-oriented RGBA color API.\n# Wrapped types can be casted back and forth with their\n# underlying type using the "as" casting operator.\ntype Color : int {\n  def r int { return (self as int) & 255 }\n  def g int { return ((self as int) >> 8) & 255 }\n  def b int { return ((self as int) >> 16) & 255 }\n  def a int { return (self as int) >>> 24 }\n\n  def toCSS string {\n    return "rgba(" +\n      r.toString + ", " +\n      g.toString + ", " +\n      b.toString + ", " +\n      (a / 255.0).toString +\n    ")"\n  }\n}\n\n# This namespace automatically merges with the definition\n# of "Color" above, mixing global and instance symbols.\nnamespace Color {\n  def new(r int, g int, b int) Color {\n    return new(r, g, b, 255)\n  }\n\n  # The name "new" is not a keyword, so any function can\n  # use that name. These functions here are just regular\n  # global functions.\n  def new(r int, g int, b int, a int) Color {\n    return (r | g << 8 | b << 16 | a << 24) as Color\n  }\n\n  # Skew supports overloading functions by both argument\n  # count and argument type.\n  def new(r double, g double, b double, a double) Color {\n    return new(_clamp(r), _clamp(g), _clamp(b), _clamp(a))\n  }\n\n  # Symbols that start with "_" have protected access and\n  # can only be used from within the type that they are\n  # declared in.\n  def _clamp(v double) int {\n    return v < 0 ? 0 : v >= 1 ? 255 : (v * 256) as int\n  }\n\n  # These will be constant-folded at compile time into\n  # a single integer value each.\n  const RED = new(255, 0, 0)\n  const GREEN = new(0, 255, 0)\n  const BLUE = new(0, 0, 255)\n}\n\n@entry\ndef main {\n  var color = Color.new(1, 2, 3)\n  var choice = (Math.random * 4) as int\n\n  # This could also have used "color = Color.RED" but\n  # the type name before the dot can be omitted when\n  # it can be automatically inferred from context.\n  switch choice {\n    case 1 { color = .RED }\n    case 2 { color = .GREEN }\n    case 3 { color = .BLUE }\n  }\n\n  console.log(color.toCSS)\n}\n\n# Declaring something with the "dynamic" type is a quick\n# way to reference an external API without stubbing out\n# all of the type declarations. This is a special type\n# that\'s a hole in the type system (anything is allowed).\n@import\nconst console dynamic\n';

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

  var translationWorker = new ApiWorker;
  var tooltipWorker = new ApiWorker;
  var editor = null;
  var skewMode = null;
  var csharpTokenizer = null;
  var jsTokenizer = null;
  var skewTokenizer = null;

  var output = document.querySelector('.output pre');
  var currentTarget = 'js';
  var isRelease = true;

  translationWorker.onCompile = function(data) {
    var html = escapeForHTML(data.log.text);

    if (data.outputs.length) {
      html = tokenizeToHTML(currentTarget === 'js' ? jsTokenizer : csharpTokenizer, data.outputs[0].contents);
      if (isRelease) html = html.replace(/\n/g, '');
    }

    output.classList.toggle('character-wrap', isRelease && data.outputs.length > 0);
    output.innerHTML = html;

    var allDiagnostics = [];
    skewMode.diagnosticsByLine = {};
    data.log.diagnostics.forEach(function(diagnostic) {
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
    var isEntityKeyword = /^(?:catch|class|const|def|enum|for|interface|namespace|over|var)$/;
    var isKeyword = /^(?:as|break|case|catch|class|const|continue|def|default|else|enum|false|finally|for|if|in|interface|is|namespace|null|over|return|self|super|switch|throw|true|try|var|while)$/;
    var isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|#.*|"(?:[^"\\]|\\.)*")/g;
        var tokens = [];
        var previous = 0;
        var wasEntityKeyword = false;

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
              value[0] === '#' ? 'comment' :
              value[0] === '"' ? 'string' :
              isKeyword.test(value) ? 'keyword' :
              wasEntityKeyword && isIdentifier.test(value) ? 'entity' :
              'text',
            value: value,
          });

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
          state: null,
          tokens: tokens,
        };
      },
    };
  };

  function getJavaScriptTokenizer() {
    var isEntityKeyword = /^(?:function|var)$/;
    var isKeyword = /^(?:break|case|catch|class|const|continue|debugger|default|delete|do|else|export|extends|false|finally|for|function|if|import|in|instanceof|let|new|null|return|super|switch|this|throw|true|try|typeof|var|void|while|with|yield)$/;
    var isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
        var tokens = [];
        var previous = 0;
        var wasEntityKeyword = false;

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
              wasEntityKeyword && isIdentifier.test(value) ? 'entity' :
              'text',
            value: value,
          });

          wasEntityKeyword = isEntityKeyword.test(value);
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
  };

  function getCSharpTokenizer() {
    var isKeyword = /^(?:abstract|as|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|do|double|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|goto|if|implicit|in|int|interface|internal|is|lock|long|namespace|new|null|object|operator|out|override|params|private|protected|public|readonly|ref|return|sbyte|sealed|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|virtual|void|volatile|while)$/;
    var isIdentifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
    var self = this;

    return {
      getLineTokens: function(line, state, row) {
        var regex = /(\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|"(?:[^"\\]|\\.)*")/g;
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
  };

  function loadTooltips(editor) {
    var timeout = 0;
    var isVisible = false;
    var tooltip = document.createElement('div');
    var latestQueryPosition = null;
    var symbolRange = null;

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
      symbolRange = null;
    }

    function isPositionInRange(position, range) {
      var start = range.start.column;
      var end = range.end.line === range.start.line ? range.end.column : editor.session.getLine(range.start.line).length;
      return position.row === range.start.line && position.column >= start && position.column <= end;
    }

    function checkTooltip(e) {
      var renderer = editor.renderer;
      var position = renderer.pixelToScreenCoordinates(e.clientX, e.clientY);
      var diagnostics = skewMode.diagnosticsByLine[position.row] || [];

      for (var i = 0; i < diagnostics.length; i++) {
        var diagnostic = diagnostics[i];
        var range = diagnostic.range;
        if (isPositionInRange(position, range)) {
          timeout = setTimeout(function() {
            showTooltip(range.start.line, range.start.column, escapeForHTML(diagnostic.text));
          }, isVisible ? 0 : 250);
          return;
        }
      }

      if (symbolRange !== null && isPositionInRange(position, symbolRange)) {
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
      var symbol = data.symbol;
      symbolRange = null;
      if (symbol !== null && symbol.range !== null && isPositionInRange(latestQueryPosition, symbol.range)) {
        var start = symbol.range.start;
        showTooltip(start.line, start.column, tokenizeToHTML(skewTokenizer, symbol.tooltip));
        symbolRange = symbol.range;
      }
    };

    tooltip.className = 'ace_tooltip';
    document.querySelector('.editor-wrapper').appendChild(tooltip);
    document.addEventListener('mousemove', checkTooltip);
    editor.session.on('changeScrollLeft', hideTooltip);
    editor.session.on('changeScrollTop', hideTooltip);
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

  function changeTarget(target, shouldBeRelease, name) {
    currentTarget = target;
    isRelease = shouldBeRelease;
    document.querySelector('.compiler-target').textContent = name;
    update();
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

  function main() {
    // Make the text wrap at the character level instead of the word level in
    // release. Why the hell is this browser specific? Isn't this supposed to
    // be standardized?
    var style = document.createElement('style');
    if (/\bChrome\b/.test(navigator.userAgent) || /\bApple\b/.test(navigator.vendor)) {
      style.textContent = '.character-wrap,.js{white-space:pre;word-break:break-word;}';
    } else if (/\bFirefox\b/.test(navigator.userAgent)) {
      style.textContent = '.character-wrap,.js{white-space:pre-wrap;word-break:break-word;word-break:break-all;}';
    }
    document.head.appendChild(style);

    var TextMode = ace.require('ace/mode/text').Mode;
    BaseMode.prototype.tokenRe = TextMode.prototype.tokenRe;
    BaseMode.prototype.nonTokenRe = TextMode.prototype.nonTokenRe;

    skewMode = new SkewMode;
    csharpTokenizer = getCSharpTokenizer();
    jsTokenizer = getJavaScriptTokenizer();
    skewTokenizer = skewMode.getTokenizer();

    [].forEach.call(document.querySelectorAll('.skew'), function(element) {
      element.innerHTML = tokenizeToHTML(skewTokenizer, element.textContent);
    });

    [].forEach.call(document.querySelectorAll('.js'), function(element) {
      element.innerHTML = tokenizeToHTML(jsTokenizer, element.textContent);
    });

    var animationCallbacks = [];
    var animate = function() {
      for (var i = 0; i < animationCallbacks.length; i++) {
        animationCallbacks[i]();
      }
      requestAnimationFrame(animate);
    };
    animate();

    [].forEach.call(document.querySelectorAll('.expand'), function(element) {
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
        animationDuration = 100 + Math.min(1, height / 1000) * 400;
        style.height = sourceHeight + 'px';
      };
    });

    // Ace really doesn't work on mobile, so don't give mobile users an interactive experience
    if (/mobi/i.test(navigator.userAgent)) {
      return;
    }

    // Only enable the menus when the editor is also active
    [].forEach.call(document.querySelectorAll('h2 a'), function(element) {
      element.classList.add('enabled');
      element.onmousedown = function(e) {
        if (document.activeElement === element) {
          element.blur();
        } else {
          element.focus();
        }
        e.preventDefault();
      };
    });

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
    editor.setOption('maxLines', 1024);
    editor.setShowFoldWidgets(false);
    editor.setShowPrintMargin(false);
    editor.on('change', update);

    var tryButton = document.querySelector('.try-button');
    tryButton.onclick = function() {
      editor.focus();
      editor.selectAll();
      tryButton.style.visibility = 'hidden';
    };
    tryButton.style.visibility = 'visible';

    loadTooltips(editor);
    update();

    var EXAMPLE_FIZZ_BUZZ = editor.getValue();
    document.getElementById('example-fizz-buzz').onmousedown = function() { editor.setValue(EXAMPLE_FIZZ_BUZZ, -1); };
    document.getElementById('example-raytracer').onmousedown = function() { editor.setValue(EXAMPLE_RAYTRACER, -1); };
    document.getElementById('example-type-wrapping').onmousedown = function() { editor.setValue(EXAMPLE_TYPE_WRAPPING, -1); };

    document.getElementById('target-javascript-debug').onmousedown = function() { changeTarget('js', false, 'JavaScript (Debug)'); };
    document.getElementById('target-javascript-release').onmousedown = function() { changeTarget('js', true, 'JavaScript (Release)'); };
    document.getElementById('target-csharp').onmousedown = function() { changeTarget('c#', false, 'C#'); };
  }

  main();

})();

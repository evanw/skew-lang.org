(function() {

  var EXAMPLE_RAYTRACER = '# This is a rough port of the raytracer example\n# from http://www.typescriptlang.org/Playground.\n# Drop the compiled output in the developer tools\n# console of an "about:blank" tab to render the\n# raytraced image. It\'ll take a little while\n# because the raytracer is designed to exercise\n# language features, not to be fast.\n\nnamespace Math {\n  def trunc(x double) int {\n    return x as int\n  }\n}\n\ndef render(width int, height int, pixels Int32Array) {\n  var scene = Scene.new(\n    Camera.new(Vector.new(3, 2, 4),\n    Vector.new(-1, 0.5, 0)))\n\n  scene.elements = [\n    Plane.new(\n      Checkerboard.new,\n      Vector.new(0, 1, 0),\n      0),\n    Sphere.new(\n      Shiny.new,\n      Vector.new(0, 1, -0.25),\n      1),\n    Sphere.new(\n      Shiny.new,\n      Vector.new(-1, 0.5, 1.5),\n      0.5),\n  ]\n\n  scene.lights = [\n    Light.new(\n      Vector.new(-2, 2.5, 0),\n      Vector.new(0.49, 0.07, 0.07)),\n    Light.new(\n      Vector.new(1.5, 2.5, 1.5),\n      Vector.new(0.07, 0.07, 0.49)),\n    Light.new(\n      Vector.new(1.5, 2.5, -1.5),\n      Vector.new(0.07, 0.49, 0.071)),\n    Light.new(\n      Vector.new(0, 3.5, 0),\n      Vector.new(0.21, 0.21, 0.35)),\n  ]\n\n  var i = 0\n  for y in 0..height {\n    var screenY = (y * 2.0 + 1 - height) / width\n    for x in 0..width {\n      var screenX = (x * 2.0 + 1 - width) / width\n      pixels[i] = scene.trace2D(screenX, -screenY).pack\n      i++\n    }\n  }\n}\n\nclass Vector {\n  const x double\n  const y double\n  const z double\n\n  def *(s double) Vector {\n    return Vector.new(x * s, y * s, z * s)\n  }\n\n  def /(s double) Vector {\n    return self * (1 / s)\n  }\n\n  def +(v Vector) Vector {\n    return Vector.new(x + v.x, y + v.y, z + v.z)\n  }\n\n  def -(v Vector) Vector {\n    return Vector.new(x - v.x, y - v.y, z - v.z)\n  }\n\n  def *(v Vector) Vector {\n    return Vector.new(x * v.x, y * v.y, z * v.z)\n  }\n\n  def cross(v Vector) Vector {\n    return Vector.new(\n      y * v.z - z * v.y,\n      z * v.x - x * v.z,\n      x * v.y - y * v.x)\n  }\n\n  def dot(v Vector) double {\n    return x * v.x + y * v.y + z * v.z\n  }\n\n  def length double {\n    return Math.sqrt(dot(self))\n  }\n\n  def unit Vector {\n    return self / length\n  }\n\n  def reflectAbout(n Vector) Vector {\n    return self - n * (2 * dot(n))\n  }\n\n  def pack int {\n    return\n      clamp(x) |\n      clamp(y) << 8 |\n      clamp(z) << 16 |\n      0xFF000000\n  }\n}\n\nnamespace Vector {\n  def clamp(x double) int {\n    if x < 0 { return 0 }\n    if x > 1 { return 255 }\n    return Math.trunc(255.999 * x)\n  }\n}\n\nnamespace Colors {\n  const WHITE = Vector.new(1, 1, 1)\n  const BLACK = Vector.new(0, 0, 0)\n  const GRAY = Vector.new(0.5, 0.5, 0.5)\n}\n\nclass Light {\n  var point Vector\n  var color Vector\n}\n\nclass Intersection {\n  var t double\n  var element Element\n}\n\nclass SurfaceInfo {\n  var diffuse Vector\n  var specular Vector\n  var reflect double\n  var roughness double\n}\n\ninterface Surface {\n  def infoAt(point Vector) SurfaceInfo\n}\n\nclass Checkerboard :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    if ((Math.trunc(point.x) ^ Math.trunc(point.z)) & 1) != 0 {\n      return WHITE_INFO\n    }\n    return BLACK_INFO\n  }\n}\n\nnamespace Checkerboard {\n  const WHITE_INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.WHITE, 0.1, 150)\n  const BLACK_INFO = SurfaceInfo.new(\n    Colors.BLACK, Colors.WHITE, 0.7, 150)\n}\n\nclass Shiny :: Surface {\n  def infoAt(point Vector) SurfaceInfo {\n    return INFO\n  }\n}\n\nnamespace Shiny {\n  const INFO = SurfaceInfo.new(\n    Colors.WHITE, Colors.GRAY, 0.7, 250)\n}\n\nclass Element {\n  var surface Surface\n\n  def intersect(origin Vector, ray Vector) Intersection\n  def normalAt(point Vector) Vector\n}\n\nclass Plane : Element {\n  var normal Vector\n  var offset double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var t = -(normal.dot(origin) + offset) / normal.dot(ray)\n    if t > 0 {\n      return Intersection.new(t, self)\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return Vector.new(0, 1, 0)\n  }\n}\n\nclass Sphere : Element {\n  var center Vector\n  var radius double\n\n  over intersect(origin Vector, ray Vector) Intersection {\n    var offset = origin - center\n    var a = ray.dot(ray)\n    var b = 2 * ray.dot(offset)\n    var c = offset.dot(offset) - radius * radius\n    var discriminant = b * b - 4 * a * c\n    if discriminant > 0 {\n      var t = (-b - Math.sqrt(discriminant)) / (2 * a)\n      if t > 0 {\n        return Intersection.new(t, self)\n      }\n    }\n    return null\n  }\n\n  over normalAt(point Vector) Vector {\n    return (point - center) / radius\n  }\n}\n\nclass Camera {\n  var point Vector\n  var forward Vector\n  var right Vector\n  var up Vector\n\n  def new(point Vector, lookAt Vector) {\n    self.point = point\n    forward = (lookAt - point).unit\n    right = forward.cross(Vector.new(0, -1, 0)).unit\n    up = forward.cross(right).unit\n  }\n}\n\nclass Scene {\n  var elements List<Element> = []\n  var lights List<Light> = []\n  var camera Camera\n\n  def intersect(origin Vector, ray Vector, ignore Element) Intersection {\n    var closest Intersection = null\n    for element in elements {\n      if element != ignore {\n        var hit = element.intersect(origin, ray)\n        if hit != null && (closest == null || hit.t < closest.t) {\n          closest = hit\n        }\n      }\n    }\n    return closest\n  }\n\n  def trace3D(origin Vector, ray Vector, ignore Element, depth int) Vector {\n    var hit = intersect(origin, ray, ignore)\n    if hit == null {\n      return Colors.BLACK\n    }\n\n    var point = origin + ray * hit.t\n    var normal = hit.element.normalAt(point)\n    var reflected = ray.reflectAbout(normal)\n    var info = hit.element.surface.infoAt(point)\n    var color = Colors.BLACK\n\n    for light in lights {\n      var delta = light.point - point\n\n      var shadow = intersect(point, delta, hit.element)\n      if shadow != null && shadow.t < 1 {\n        continue\n      }\n      delta = delta.unit\n\n      # Diffuse\n      var weight = Math.max(0, delta.dot(normal))\n      color = color + light.color * info.diffuse * weight\n\n      # Specular\n      weight = Math.pow(Math.max(0, delta.dot(reflected)), info.roughness)\n      color = color + light.color * info.specular * weight\n    }\n\n    # Reflection\n    if depth > 0 {\n      var recursive = trace3D(point, reflected, hit.element, depth - 1)\n      color = color + recursive * info.reflect\n    }\n\n    return color\n  }\n\n  def trace2D(x double, y double) Vector {\n    var ray = camera.forward + camera.right * x + camera.up * y\n    return trace3D(camera.point, ray.unit, null, 5)\n  }\n}\n\n@entry\ndef main {\n  var canvas = document.createElement("canvas")\n  var context = canvas.getContext("2d")\n  var width = 640\n  var height = 480\n  var imageData = context.createImageData(width, height)\n  canvas.width = width\n  canvas.height = height\n  render(width, height, Int32Array.new(imageData.data.buffer))\n  context.putImageData(imageData, 0, 0)\n  document.body.appendChild(canvas)\n}\n\n@import\nclass Int32Array {\n  def new(length int)\n  def []=(index int, value int)\n}\n\n@import\nvar document dynamic\n';
  var EXAMPLE_TYPE_WRAPPING = '# Type wrapping allows for objects to be implemented\n# directly in terms of other objects without any extra\n# allocation at runtime. Here a 32-bit integer is\n# wrapped in a nice object-oriented RGBA color API.\n# Wrapped types can be casted back and forth with their\n# underlying type using the "as" casting operator.\ntype Color : int {\n  def red int { return (self as int) & 255 }\n  def green int { return ((self as int) >> 8) & 255 }\n  def blue int { return ((self as int) >> 16) & 255 }\n  def alpha int { return (self as int) >>> 24 }\n\n  def toCSS string {\n    return "rgba(" +\n      red.toString + ", " +\n      green.toString + ", " +\n      blue.toString + ", " +\n      (alpha / 255.0).toString +\n    ")"\n  }\n}\n\n# This namespace automatically merges with the definition\n# of "Color" above, mixing global and instance symbols.\nnamespace Color {\n  def new(r int, g int, b int) Color {\n    return new(r, g, b, 255)\n  }\n\n  # The name "new" is not a keyword, so any function can\n  # use that name. These functions here are just regular\n  # global functions.\n  def new(r int, g int, b int, a int) Color {\n    return (r | g << 8 | b << 16 | a << 24) as Color\n  }\n\n  # Skew supports overloading functions by both argument\n  # count and argument type.\n  def new(r double, g double, b double, a double) Color {\n    return new(_clamp(r), _clamp(g), _clamp(b), _clamp(a))\n  }\n\n  # Symbols that start with "_" have protected access and\n  # can only be used from within the type that they are\n  # declared in.\n  def _clamp(v double) int {\n    return v < 0 ? 0 : v >= 1 ? 255 : (v * 256) as int\n  }\n\n  # These will be constant-folded at compile time into\n  # a single integer value each.\n  const RED = new(255, 0, 0)\n  const GREEN = new(0, 255, 0)\n  const BLUE = new(0, 0, 255)\n}\n\n@entry\ndef main {\n  var color = Color.new(1, 2, 3)\n  var choice = (Math.random * 4) as int\n\n  # This could also have used "color = Color.RED" but\n  # the type name before the dot can be omitted when\n  # it can be automatically inferred from context.\n  switch choice {\n    case 1 { color = .RED }\n    case 2 { color = .GREEN }\n    case 3 { color = .BLUE }\n  }\n\n  console.log(color.toCSS)\n}\n\n# Declaring something with the "dynamic" type is a quick\n# way to reference an external API without stubbing out\n# all of the type declarations. This is a special type\n# that\'s a hole in the type system (anything is allowed).\n@import\nconst console dynamic\n';

  var jsKeywords = [
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'export',
    'extends',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'let',
    'new',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
    'yield',
  ];

  var worker = new Worker('skew-api.min.js');
  var isWorkerBusy = false;
  var pendingWorkerMessage = null;
  var editor = null;
  var mode = null;

  var output = document.querySelector('.output pre');
  var currentTarget = 'js';
  var isRelease = true;

  worker.onmessage = function(e) {
    if (pendingWorkerMessage) {
      worker.postMessage(pendingWorkerMessage);
      pendingWorkerMessage = null;
      return;
    }

    isWorkerBusy = false;
    var data = e.data;
    var html = data.log.length + ' issue' + (data.log.length === 1 ? '' : 's') + ' found ';

    if (data.outputs.length) {
      html = data.outputs[0].contents.split(/(\b[A-Za-z_][A-Za-z0-9_]*\b|\/\/.*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g).map(function(part, i) {
        var token = part.replace(/&/g, '&amp;').replace(/</g, '&lt;');
        if (i & 1) {
          if ('"\''.indexOf(token[0]) >= 0) return '<span class="ace_string">' + token + '</span>';
          if (jsKeywords.indexOf(token) >= 0) return '<span class="ace_keyword">' + token + '</span>';
          if (token.slice(0, 2) === '//') return '<span class="ace_comment">' + token + '</span>';
        }
        return token;
      }).join('');
    }

    // Make the text wrap at the character level instead of the word level in
    // release. Why the hell is this browser specific? Isn't this supposed to
    // be standardized?
    if (/\bChrome\b/.test(navigator.userAgent) || /\bApple\b/.test(navigator.vendor)) {
      output.style.whiteSpace = isRelease ? 'pre' : 'pre-wrap';
    } else if (/\bFirefox\b/.test(navigator.userAgent)) {
      output.style.wordBreak = isRelease ? 'break-all' : 'normal';
    }

    output.innerHTML = isRelease ? html.replace(/\n/g, '') : html;

    var allDiagnostics = [];
    mode.diagnosticsByLine = {};
    data.log.forEach(function(diagnostic) {
      var start = diagnostic.range.start;
      var diagnostics = mode.diagnosticsByLine[start.line];
      if (!diagnostics) {
        diagnostics = [];
        allDiagnostics.push(diagnostics);
        mode.diagnosticsByLine[start.line] = diagnostics;
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
    editor.session.setMode(mode);
  };

  function loadTooltips(editor) {
    var timeout = 0;
    var isVisible = false;
    var tooltip = document.createElement('div');

    var showTooltip = function(x, y, text) {
      tooltip.textContent = text;
      tooltip.style.display = 'block';
      tooltip.style.left = x + 'px';
      tooltip.style.top = y + 'px';
      isVisible = true;
    };

    var hideTooltip = function() {
      if (!isVisible) return;
      tooltip.style.display = 'none';
      isVisible = false;
    };

    var checkTooltip = function(e) {
      clearTimeout(timeout);
      var renderer = editor.renderer;
      var position = renderer.pixelToScreenCoordinates(e.clientX, e.clientY);
      var diagnostics = mode.diagnosticsByLine[position.row] || [];

      for (var i = 0; i < diagnostics.length; i++) {
        var diagnostic = diagnostics[i];
        var range = diagnostic.range;
        var start = range.start.column;
        var end = range.end.line === range.start.line ? range.end.column : editor.session.getLine(range.start.line).length;

        if (position.column > start && position.column < end ||
            position.column === start && position.side === 1 ||
            position.column === end && position.side === -1) {
          var x = renderer.gutterWidth + renderer.$padding + Math.round(start * renderer.characterWidth) - renderer.scrollLeft;
          var y = (range.start.line + 1) * renderer.lineHeight - renderer.scrollTop;
          if (isVisible) {
            showTooltip(x, y, diagnostic.text);
          } else {
            timeout = setTimeout(function() {
              showTooltip(x, y, diagnostic.text);
            }, 250);
          }
          return;
        }
      }

      hideTooltip();
    };

    tooltip.className = 'ace_tooltip';
    document.querySelector('.editor-wrapper').appendChild(tooltip);
    document.addEventListener('mousemove', checkTooltip);
    editor.session.on('changeScrollLeft', hideTooltip);
    editor.session.on('changeScrollTop', hideTooltip);
  }

  function update() {
    var message = {
      type: 'compile',
      target: currentTarget,
      release: isRelease,
      inputs: [{
        name: '<stdin>',
        contents: editor.getValue(),
      }],
    };

    if (isWorkerBusy) {
      pendingWorkerMessage = message;
    } else {
      worker.postMessage(message);
      isWorkerBusy = true;
    }
  }

  function changeTarget(target, shouldBeRelease, name) {
    currentTarget = target;
    isRelease = shouldBeRelease;
    document.querySelector('.compiler-target').textContent = name;
    update();
  }

  function main() {
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

    var TextMode = ace.require('ace/mode/text').Mode;
    mode = new SkewMode;
    mode.tokenRe = TextMode.prototype.tokenRe;
    mode.nonTokenRe = TextMode.prototype.nonTokenRe;

    editor = ace.edit('editor');
    editor.$blockScrolling = Infinity;
    editor.renderer.setDisplayIndentGuides(false);
    editor.renderer.setPadding(0);
    editor.renderer.setShowGutter(false);
    editor.session.setMode(mode);
    editor.session.setTabSize(2);
    editor.setHighlightActiveLine(false);
    editor.setOption('maxLines', 1024);
    editor.setShowFoldWidgets(false);
    editor.setShowPrintMargin(false);
    editor.on('change', update);

    loadTooltips(editor);
    update();

    var EXAMPLE_FIZZ_BUZZ = editor.getValue();
    document.getElementById('example-fizz-buzz').onmousedown = function() { editor.setValue(EXAMPLE_FIZZ_BUZZ, -1); };
    document.getElementById('example-raytracer').onmousedown = function() { editor.setValue(EXAMPLE_RAYTRACER, -1); };
    document.getElementById('example-type-wrapping').onmousedown = function() { editor.setValue(EXAMPLE_TYPE_WRAPPING, -1); };

    document.getElementById('target-javascript-debug').onmousedown = function() { changeTarget('js', false, 'JavaScript (Debug)'); };
    document.getElementById('target-javascript-release').onmousedown = function() { changeTarget('js', true, 'JavaScript (Release)'); };
    // document.getElementById('target-csharp').onmousedown = function() { changeTarget('c#', false, 'C#'); };
  }

  main();

})();

function SkewMode() {
  this.diagnosticsByLine = {};
}

SkewMode.prototype.createWorker = function() {
};

SkewMode.prototype.transformAction = function() {
};

SkewMode.prototype.checkOutdent = function(state, line, input) {
  if (!/^\s+$/.test(line)) {
    return false; // Early-out if there's no indent to remove
  }
  return /^\s*}/.test(input);
};

SkewMode.prototype.autoOutdent = function(state, session, row) {
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

SkewMode.prototype.getNextLineIndent = function(state, line, tab) {
  var indent = /^\s*/.exec(line)[0];
  if (/^.*[{(\[]\s*$/.exec(line)) {
    indent += tab;
  }
  return indent;
};

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

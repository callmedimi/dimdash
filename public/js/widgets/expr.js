/**
 * DimDash Safe Expression Evaluator (P08)
 * STRICTLY ZERO dynamic code execution — Safe AST-based Pratt / Recursive-Descent Parser
 * Evaluates math, logical operators, comparisons, ternary, member access, and built-in functions
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ExprEngine = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------------------
  // 1. Built-in Safe Functions Library
  // ------------------------------------------------------------------------
  const BUILTINS = {
    min: (...args) => Math.min(...args.flat()),
    max: (...args) => Math.max(...args.flat()),
    round: (n, d = 0) => {
      const f = Math.pow(10, d);
      return Math.round(Number(n) * f) / f;
    },
    floor: (n) => Math.floor(Number(n)),
    ceil: (n) => Math.ceil(Number(n)),
    abs: (n) => Math.abs(Number(n)),
    clamp: (n, min, max) => Math.max(Number(min), Math.min(Number(max), Number(n))),
    avg: (...args) => {
      const arr = args.flat().map(Number).filter((v) => !isNaN(v));
      return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    },
    sum: (...args) => {
      return args.flat().map(Number).filter((v) => !isNaN(v)).reduce((a, b) => a + b, 0);
    },
    fmt: (n, decimals = 1) => {
      const num = Number(n);
      return isNaN(num) ? '—' : num.toFixed(decimals);
    },
    bytes: (n, decimals = 1) => {
      const num = Number(n);
      if (isNaN(num) || num < 0) return '0 B';
      if (num === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.floor(Math.log(num) / Math.log(k));
      const val = (num / Math.pow(k, i)).toFixed(decimals);
      return `${parseFloat(val)} ${sizes[i] || 'B'}`;
    },
    pct: (val, total = 100) => {
      const v = Number(val);
      const t = Number(total);
      if (isNaN(v) || isNaN(t) || t === 0) return '0%';
      return `${Math.round((v / t) * 100)}%`;
    },
    dur: (seconds) => {
      const s = Math.floor(Number(seconds));
      if (isNaN(s) || s <= 0) return '0s';
      if (s < 60) return `${s}s`;
      const m = Math.floor(s / 60);
      const remS = s % 60;
      if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`;
      const h = Math.floor(m / 60);
      const remM = m % 60;
      if (h < 24) return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
      const d = Math.floor(h / 24);
      const remH = h % 24;
      return remH > 0 ? `${d}d ${remH}h` : `${d}d`;
    }
  };

  // Blocked prototype properties for strict security
  const BLOCKED_PROPS = new Set(['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__']);

  // ------------------------------------------------------------------------
  // 2. Tokenizer
  // ------------------------------------------------------------------------
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
      const ch = input[i];

      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Numbers
      if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(input[i + 1] || ''))) {
        let numStr = '';
        while (i < len && /[0-9.]/.test(input[i])) {
          numStr += input[i++];
        }
        tokens.push({ type: 'number', value: parseFloat(numStr) });
        continue;
      }

      // Strings (single or double quoted)
      if (ch === '"' || ch === "'") {
        const quote = ch;
        let str = '';
        i++; // skip open quote
        while (i < len && input[i] !== quote) {
          if (input[i] === '\\' && i + 1 < len) {
            str += input[++i];
          } else {
            str += input[i];
          }
          i++;
        }
        i++; // skip close quote
        tokens.push({ type: 'string', value: str });
        continue;
      }

      // Multi-character Operators
      const two = input.substr(i, 2);
      if (['==', '!=', '<=', '>=', '&&', '||', '?.'].includes(two)) {
        tokens.push({ type: 'op', value: two });
        i += 2;
        continue;
      }

      // Single-character Operators & Punctuation
      if (['+', '-', '*', '/', '%', '?', ':', '<', '>', '!', '(', ')', '[', ']', ',', '.'].includes(ch)) {
        tokens.push({ type: 'op', value: ch });
        i++;
        continue;
      }

      // Identifiers / Keywords / Property Names
      if (/[a-zA-Z_$]/.test(ch)) {
        let ident = '';
        while (i < len && /[a-zA-Z0-9_$-]/.test(input[i])) {
          ident += input[i++];
        }
        if (ident === 'true') {
          tokens.push({ type: 'boolean', value: true });
        } else if (ident === 'false') {
          tokens.push({ type: 'boolean', value: false });
        } else if (ident === 'null') {
          tokens.push({ type: 'null', value: null });
        } else {
          tokens.push({ type: 'ident', value: ident });
        }
        continue;
      }

      // Unrecognized character
      i++;
    }

    return tokens;
  }

  // ------------------------------------------------------------------------
  // 3. Recursive-Descent Parser
  // ------------------------------------------------------------------------
  function parse(tokens) {
    let pos = 0;

    function peek() {
      return tokens[pos];
    }

    function consume(expectedOp) {
      const tok = tokens[pos];
      if (!tok) return null;
      if (expectedOp && (tok.type !== 'op' || tok.value !== expectedOp)) {
        return null;
      }
      pos++;
      return tok;
    }

    // Top: Ternary Conditional (expr ? expr : expr)
    function parseConditional() {
      let node = parseLogicalOr();
      if (peek() && peek().type === 'op' && peek().value === '?') {
        consume('?');
        const consequent = parseConditional();
        consume(':');
        const alternate = parseConditional();
        node = { type: 'ternary', test: node, consequent, alternate };
      }
      return node;
    }

    // Logical OR (||)
    function parseLogicalOr() {
      let left = parseLogicalAnd();
      while (peek() && peek().type === 'op' && peek().value === '||') {
        consume('||');
        const right = parseLogicalAnd();
        left = { type: 'binary', op: '||', left, right };
      }
      return left;
    }

    // Logical AND (&&)
    function parseLogicalAnd() {
      let left = parseEquality();
      while (peek() && peek().type === 'op' && peek().value === '&&') {
        consume('&&');
        const right = parseEquality();
        left = { type: 'binary', op: '&&', left, right };
      }
      return left;
    }

    // Equality (==, !=)
    function parseEquality() {
      let left = parseRelational();
      while (peek() && peek().type === 'op' && ['==', '!='].includes(peek().value)) {
        const op = consume().value;
        const right = parseRelational();
        left = { type: 'binary', op, left, right };
      }
      return left;
    }

    // Relational (<, <=, >, >=)
    function parseRelational() {
      let left = parseAdditive();
      while (peek() && peek().type === 'op' && ['<', '<=', '>', '>='].includes(peek().value)) {
        const op = consume().value;
        const right = parseAdditive();
        left = { type: 'binary', op, left, right };
      }
      return left;
    }

    // Additive (+, -)
    function parseAdditive() {
      let left = parseMultiplicative();
      while (peek() && peek().type === 'op' && ['+', '-'].includes(peek().value)) {
        const op = consume().value;
        const right = parseMultiplicative();
        left = { type: 'binary', op, left, right };
      }
      return left;
    }

    // Multiplicative (*, /, %)
    function parseMultiplicative() {
      let left = parseUnary();
      while (peek() && peek().type === 'op' && ['*', '/', '%'].includes(peek().value)) {
        const op = consume().value;
        const right = parseUnary();
        left = { type: 'binary', op, left, right };
      }
      return left;
    }

    // Unary (!, -, +)
    function parseUnary() {
      if (peek() && peek().type === 'op' && ['!', '-', '+'].includes(peek().value)) {
        const op = consume().value;
        const argument = parseUnary();
        return { type: 'unary', op, argument };
      }
      return parsePostfix();
    }

    // Postfix (Member Access, Call, Indexing)
    function parsePostfix() {
      let node = parsePrimary();

      while (peek() && peek().type === 'op' && ['.', '?.', '(', '['].includes(peek().value)) {
        const opTok = consume();

        // Function call: fn(a, b)
        if (opTok.value === '(') {
          const args = [];
          if (!(peek() && peek().type === 'op' && peek().value === ')')) {
            do {
              args.push(parseConditional());
            } while (consume(','));
          }
          consume(')');
          node = { type: 'call', callee: node, args };
          continue;
        }

        // Bracket indexing: a[0] or a['key']
        if (opTok.value === '[') {
          const property = parseConditional();
          consume(']');
          node = { type: 'member', object: node, property, computed: true, optional: false };
          continue;
        }

        // Dot member access: a.b or optional chaining a?.b
        const isOptional = opTok.value === '?.';
        const propTok = consume();
        if (!propTok || (propTok.type !== 'ident' && propTok.type !== 'number')) {
          break;
        }
        node = {
          type: 'member',
          object: node,
          property: { type: 'literal', value: propTok.value },
          computed: false,
          optional: isOptional
        };
      }

      return node;
    }

    // Primary (Number, String, Boolean, Identifier, Grouped Expression)
    function parsePrimary() {
      const tok = peek();
      if (!tok) return { type: 'literal', value: undefined };

      if (tok.type === 'number' || tok.type === 'string' || tok.type === 'boolean' || tok.type === 'null') {
        consume();
        return { type: 'literal', value: tok.value };
      }

      if (tok.type === 'ident') {
        consume();
        return { type: 'ident', name: tok.value };
      }

      if (tok.type === 'op' && tok.value === '(') {
        consume('(');
        const expr = parseConditional();
        consume(')');
        return expr;
      }

      consume();
      return { type: 'literal', value: undefined };
    }

    return parseConditional();
  }

  // ------------------------------------------------------------------------
  // 4. Safe Evaluator Compiler (Produces Fast Closure)
  // ------------------------------------------------------------------------
  function compileAST(node) {
    if (!node) return () => undefined;

    switch (node.type) {
      case 'literal':
        return () => node.value;

      case 'ident': {
        const name = node.name;
        return (scope) => {
          if (BLOCKED_PROPS.has(name)) return undefined;
          if (scope && name in scope) return scope[name];
          if (name in BUILTINS) return BUILTINS[name];
          return undefined;
        };
      }

      case 'unary': {
        const argFn = compileAST(node.argument);
        const op = node.op;
        if (op === '!') return (scope) => !argFn(scope);
        if (op === '-') return (scope) => -Number(argFn(scope));
        if (op === '+') return (scope) => +Number(argFn(scope));
        return (scope) => argFn(scope);
      }

      case 'binary': {
        const leftFn = compileAST(node.left);
        const rightFn = compileAST(node.right);
        const op = node.op;

        switch (op) {
          case '+': return (scope) => leftFn(scope) + rightFn(scope);
          case '-': return (scope) => Number(leftFn(scope)) - Number(rightFn(scope));
          case '*': return (scope) => Number(leftFn(scope)) * Number(rightFn(scope));
          case '/': {
            return (scope) => {
              const denom = Number(rightFn(scope));
              return denom === 0 ? 0 : Number(leftFn(scope)) / denom;
            };
          }
          case '%': return (scope) => Number(leftFn(scope)) % Number(rightFn(scope));
          case '==': return (scope) => leftFn(scope) == rightFn(scope);
          case '!=': return (scope) => leftFn(scope) != rightFn(scope);
          case '<': return (scope) => Number(leftFn(scope)) < Number(rightFn(scope));
          case '<=': return (scope) => Number(leftFn(scope)) <= Number(rightFn(scope));
          case '>': return (scope) => Number(leftFn(scope)) > Number(rightFn(scope));
          case '>=': return (scope) => Number(leftFn(scope)) >= Number(rightFn(scope));
          case '&&': return (scope) => leftFn(scope) && rightFn(scope);
          case '||': return (scope) => leftFn(scope) || rightFn(scope);
          default: return () => undefined;
        }
      }

      case 'ternary': {
        const testFn = compileAST(node.test);
        const consFn = compileAST(node.consequent);
        const altFn = compileAST(node.alternate);
        return (scope) => (testFn(scope) ? consFn(scope) : altFn(scope));
      }

      case 'member': {
        const objFn = compileAST(node.object);
        const propFn = compileAST(node.property);
        const isOptional = node.optional;

        return (scope) => {
          const obj = objFn(scope);
          if (obj === null || obj === undefined) {
            return undefined;
          }
          const prop = propFn(scope);
          if (typeof prop !== 'string' && typeof prop !== 'number') return undefined;
          if (BLOCKED_PROPS.has(String(prop))) return undefined;
          try {
            return obj[prop];
          } catch {
            return undefined;
          }
        };
      }

      case 'call': {
        const calleeFn = compileAST(node.callee);
        const argFns = node.args.map(compileAST);

        return (scope) => {
          const fn = calleeFn(scope);
          if (typeof fn !== 'function') return undefined;
          try {
            const evaluatedArgs = argFns.map((af) => af(scope));
            return fn(...evaluatedArgs);
          } catch {
            return undefined;
          }
        };
      }

      default:
        return () => undefined;
    }
  }

  // ------------------------------------------------------------------------
  // 5. Public API: compile & evaluate
  // ------------------------------------------------------------------------
  const CACHE = new Map();

  function compile(exprStr) {
    if (typeof exprStr !== 'string') {
      return () => undefined;
    }
    const trimmed = exprStr.trim();
    if (!trimmed) return () => undefined;

    if (CACHE.has(trimmed)) {
      return CACHE.get(trimmed);
    }

    try {
      const tokens = tokenize(trimmed);
      const ast = parse(tokens);
      const fn = compileAST(ast);
      CACHE.set(trimmed, fn);
      return fn;
    } catch {
      return () => undefined;
    }
  }

  function evaluate(exprStr, scope = {}) {
    try {
      const fn = compile(exprStr);
      return fn(scope);
    } catch {
      return undefined;
    }
  }

  return {
    compile,
    evaluate,
    tokenize,
    parse,
    BUILTINS,
    BLOCKED_PROPS
  };
});

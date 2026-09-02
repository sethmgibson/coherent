#!/usr/bin/env python3
"""Coherent Python sidecar. Stdlib ast only. JSON on stdin/stdout. No caches."""

from __future__ import annotations

import ast
import json
import re
import sys
from typing import Any

MEANINGFUL = re.compile(
    r"(authoriz|auth|validat|map|transform|cache|log|metric|audit|translat|wrap|"
    r"retr|transaction|lock|hydrat|polic|permission|guard)",
    re.I,
)
FLAG_NAME = re.compile(
    r"^(is|has|can|should|need|allow|enable|disable|show|hide|skip|force|include|"
    r"exclude|use|with|require)[A-Z0-9_]|Flag$|Enabled$|Disabled$|Visible$|"
    r"Hidden$|Active$|Required$|Optional$|"
    r"^(ok|debug|verbose|silent|dryRun|dry_run|enabled|disabled|visible|hidden|"
    r"active|inactive|notify|rush)$",
    re.I,
)
NOT_A_FLAG = {
    "undefined",
    "null",
    "None",
    "True",
    "False",
    "length",
    "size",
    "count",
    "amount",
    "value",
    "name",
    "type",
    "id",
    "index",
    "key",
    "error",
    "message",
    "status",
    "code",
    "result",
    "data",
}
LOG_NAME = re.compile(r"(log|logger|print|report|capture|track|metric|warning|exception)", re.I)
TEST_DIR = re.compile(r"(^|/)(tests?|__tests__|spec|e2e)(/|$)")
TEST_FILE = re.compile(r"(^|/)(test_[^/]+\.py|[^/]+_test\.py|conftest\.py)$")


def main() -> int:
    request = json.load(sys.stdin)
    mode = request.get("mode") or "analyze"
    files = request.get("files") or []
    if mode == "imports":
        json.dump({"imports": collect_imports(files), "syntaxErrors": []}, sys.stdout)
        return 0
    findings: list[dict[str, Any]] = []
    syntax_errors: list[dict[str, Any]] = []
    flag_sets: list[dict[str, Any]] = []
    for file in files:
        relative = file["relative"]
        try:
            source = read_text(file["path"])
            tree = ast.parse(source, filename=relative)
        except SyntaxError as error:
            syntax_errors.append(syntax_error(relative, error))
            continue
        except OSError as error:
            syntax_errors.append(
                {
                    "file": relative,
                    "line": 1,
                    "column": 1,
                    "message": str(error),
                }
            )
            continue
        attach_parents(tree)
        collect_unreachable(findings, tree, relative, source)
        if is_test_file(relative):
            continue
        collect_wrappers(findings, tree, relative)
        collect_booleans(findings, flag_sets, tree, relative)
        collect_exceptions(findings, tree, relative)
    add_boolean_combos(findings, flag_sets)
    json.dump({"findings": findings, "syntaxErrors": syntax_errors}, sys.stdout)
    return 0


def read_text(path: str) -> str:
    with open(path, encoding="utf-8") as handle:
        return handle.read()


def syntax_error(relative: str, error: SyntaxError) -> dict[str, Any]:
    return {
        "file": relative,
        "line": error.lineno or 1,
        "column": error.offset or 1,
        "message": error.msg or "invalid syntax",
    }


def is_test_file(relative: str) -> bool:
    return bool(TEST_DIR.search(relative) or TEST_FILE.search(relative))


def collect_unreachable(
    findings: list[dict[str, Any]],
    tree: ast.AST,
    relative: str,
    source: str,
) -> None:
    for node in ast.walk(tree):
        for body in statement_blocks(node):
            if body:
                scan_block(findings, body, relative, source)


def statement_blocks(node: ast.AST) -> list[list[ast.stmt]]:
    if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        return [list(node.body)]
    if isinstance(node, ast.ExceptHandler):
        return [list(node.body)]
    if isinstance(node, (ast.For, ast.AsyncFor, ast.While)):
        return [list(node.body), list(node.orelse)]
    if isinstance(node, (ast.With, ast.AsyncWith)):
        return [list(node.body)]
    if isinstance(node, ast.Try) or try_star(node):
        return [list(node.body), list(node.orelse), list(node.finalbody)]
    if isinstance(node, ast.match_case):
        return [list(node.body)]
    return []


def try_star(node: ast.AST) -> bool:
    try_star_type = getattr(ast, "TryStar", None)
    return try_star_type is not None and isinstance(node, try_star_type)


def scan_block(
    findings: list[dict[str, Any]],
    statements: list[ast.stmt],
    relative: str,
    source: str,
) -> None:
    unreachable = False
    for statement in statements:
        if isinstance(statement, ast.If):
            if is_false_literal(statement.test):
                for target in iter_branch(statement.body):
                    findings.append(
                        finding(
                            "A08",
                            f"unreachable-false:{relative}:{stable_text(target, source)}",
                            "Unreachable branch",
                            "medium",
                            "high",
                            "confirmed",
                            "The then-branch of `if False` is unreachable.",
                            {"summary": "Condition is the literal False."},
                            [location(relative, target)],
                            [],
                        )
                    )
            elif isinstance(statement.body, list):
                scan_block(findings, statement.body, relative, source)
            if statement.orelse:
                scan_block(findings, statement.orelse, relative, source)
        if unreachable:
            findings.append(
                finding(
                    "A08",
                    f"unreachable:{relative}:{stable_text(statement, source)}",
                    "Unreachable statement",
                    "medium",
                    "high",
                    "confirmed",
                    "A statement appears after a return, raise, break, or continue in the same block.",
                    {
                        "summary": "Control flow cannot reach this statement.",
                        "details": [stable_text(statement, source)[:120]],
                    },
                    [location(relative, statement)],
                    [],
                )
            )
            continue
        if terminates(statement):
            unreachable = True


def iter_branch(body: list[ast.stmt]) -> list[ast.stmt]:
    return body


def terminates(statement: ast.stmt) -> bool:
    return isinstance(statement, (ast.Return, ast.Raise, ast.Break, ast.Continue))


def is_false_literal(node: ast.AST) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def collect_wrappers(findings: list[dict[str, Any]], tree: ast.AST, relative: str) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        name = node.name
        if not name or MEANINGFUL.search(name) or node.decorator_list:
            continue
        params = callable_params(node)
        if not params:
            continue
        body = significant_body(node.body)
        if len(body) != 1:
            continue
        call = single_call(body[0])
        if call is None or not same_arguments(params, call):
            continue
        if is_builder_chain(call) or call_is_meaningful(call):
            continue
        callee = callee_name(call)
        findings.append(
            finding(
                "B04",
                f"forwarding:{relative}:{name}",
                "Forwarding wrapper",
                "medium",
                "medium",
                "candidate",
                (
                    f"'{name}' accepts arguments, calls one downstream operation "
                    "with the same values, and adds no visible domain behavior."
                ),
                {
                    "summary": f"{name} forwards to {callee}.",
                    "details": [
                        f"Parameters: {', '.join(params)}",
                        f"Downstream: {callee}",
                        "No authorization, validation, mapping, caching, logging, or error translation is visible.",
                        "Decorators, public exports, and registration are not treated as deletion evidence.",
                    ],
                },
                [location(relative, node, name)],
                [name, callee],
            )
        )


def callable_params(node: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    args = [arg.arg for arg in node.args.args]
    if args and args[0] in {"self", "cls"}:
        args = args[1:]
    return args


def significant_body(body: list[ast.stmt]) -> list[ast.stmt]:
    statements: list[ast.stmt] = []
    for statement in body:
        if isinstance(statement, ast.Expr) and is_docstring(statement):
            continue
        if isinstance(statement, ast.Pass):
            continue
        statements.append(statement)
    return statements


def is_docstring(statement: ast.Expr) -> bool:
    return isinstance(statement.value, ast.Constant) and isinstance(statement.value.value, str)


def single_call(statement: ast.stmt) -> ast.Call | None:
    expr: ast.AST | None
    if isinstance(statement, ast.Return):
        expr = statement.value
    elif isinstance(statement, ast.Expr):
        expr = statement.value
    else:
        return None
    if isinstance(expr, ast.Await):
        expr = expr.value
    return expr if isinstance(expr, ast.Call) else None


def same_arguments(params: list[str], call: ast.Call) -> bool:
    if call.keywords:
        return False
    args = call.args
    if len(args) == 1 and isinstance(args[0], ast.Starred) and isinstance(args[0].value, ast.Name):
        return True
    if len(args) != len(params):
        return False
    for arg, param in zip(args, params):
        if isinstance(arg, ast.Name) and arg.id == param:
            continue
        if isinstance(arg, ast.Starred) and isinstance(arg.value, ast.Name) and arg.value.id == param:
            continue
        return False
    return True


def is_builder_chain(call: ast.Call) -> bool:
    expr = call.func
    while isinstance(expr, ast.Attribute):
        expr = expr.value
        if isinstance(expr, ast.Call):
            return True
        if isinstance(expr, ast.Await) and isinstance(expr.value, ast.Call):
            return True
    return False


def call_is_meaningful(call: ast.Call) -> bool:
    name = callee_name(call)
    return bool(MEANINGFUL.search(name))


def callee_name(call: ast.Call) -> str:
    return ast.unparse(call.func)


def collect_booleans(
    findings: list[dict[str, Any]],
    flag_sets: list[dict[str, Any]],
    tree: ast.AST,
    relative: str,
) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        name = node.name
        if not name:
            continue
        bool_params = [arg.arg for arg in node.args.args if is_bool_param(node, arg)]
        branched = boolean_branches(node)
        flags = list(dict.fromkeys([*bool_params, *branched]))
        flag_sets.append({"name": name, "flags": flags, "file": relative})
        if len(bool_params) >= 3:
            findings.append(flag_finding(node, name, relative, bool_params, branched, "boolean-params"))
        elif len(bool_params) >= 2 and len(branched) >= 3:
            findings.append(flag_finding(node, name, relative, bool_params, branched, "boolean-branching"))


def is_bool_param(fn: ast.FunctionDef | ast.AsyncFunctionDef, arg: ast.arg) -> bool:
    if annotation_is_bool(arg.annotation):
        return True
    defaults = bool_defaults(fn, arg)
    return defaults or bool(FLAG_NAME.match(arg.arg))


def annotation_is_bool(annotation: ast.AST | None) -> bool:
    if annotation is None:
        return False
    if isinstance(annotation, ast.Name):
        return annotation.id == "bool"
    if isinstance(annotation, ast.Constant):
        return annotation.value == "bool"
    return False


def bool_defaults(fn: ast.FunctionDef | ast.AsyncFunctionDef, arg: ast.arg) -> bool:
    args = fn.args.args
    defaults = fn.args.defaults
    index = args.index(arg)
    offset = len(args) - len(defaults)
    if index < offset:
        return False
    value = defaults[index - offset]
    return isinstance(value, ast.Constant) and value.value in {True, False}


def boolean_branches(fn: ast.FunctionDef | ast.AsyncFunctionDef) -> list[str]:
    names: set[str] = set()
    for node in ast.walk(fn):
        if isinstance(node, ast.If):
            collect_flag_names(node.test, names)
        elif isinstance(node, ast.IfExp):
            collect_flag_names(node.test, names)
    return sorted(names)


def collect_flag_names(node: ast.AST, names: set[str]) -> None:
    if isinstance(node, ast.UnaryOp):
        collect_flag_names(node.operand, names)
        return
    if isinstance(node, ast.BoolOp):
        for value in node.values:
            collect_flag_names(value, names)
        return
    if isinstance(node, ast.Compare):
        collect_flag_names(node.left, names)
        for comparator in node.comparators:
            collect_flag_names(comparator, names)
        return
    name = flag_name(node)
    if name:
        names.add(name)


def flag_name(node: ast.AST) -> str | None:
    if isinstance(node, ast.Name):
        name = node.id
    elif isinstance(node, ast.Attribute):
        name = node.attr
    else:
        return None
    if name in NOT_A_FLAG:
        return None
    return name if FLAG_NAME.match(name) else None


def flag_finding(
    node: ast.AST,
    name: str,
    relative: str,
    bool_params: list[str],
    branched: list[str],
    kind: str,
) -> dict[str, Any]:
    return finding(
        "C03",
        f"{kind}:{relative}:{name}",
        "Boolean parameter / branch explosion",
        "high" if len(bool_params) >= 4 else "medium",
        "high",
        "candidate",
        f"'{name}' selects behavior with several booleans. Two booleans alone are not enough to report.",
        {
            "summary": (
                f"{len(bool_params)} boolean parameters; branches on "
                f"{', '.join(branched) or 'those flags'}."
            ),
            "details": [
                f"Boolean parameters: {', '.join(bool_params)}",
                (
                    f"Boolean branches: {', '.join(branched)}"
                    if branched
                    else "No additional boolean identifiers branched."
                ),
            ],
        },
        [location(relative, node, name)],
        [name, *bool_params],
    )


def add_boolean_combos(findings: list[dict[str, Any]], flag_sets: list[dict[str, Any]]) -> None:
    combinations: dict[str, list[str]] = {}
    for entry in flag_sets:
        if len(entry["flags"]) < 3:
            continue
        key = "+".join(sorted(entry["flags"]))
        combinations.setdefault(key, []).append(f"{entry['name']} ({entry['file']})")
    for key, users in combinations.items():
        if len(users) < 2:
            continue
        findings.append(
            finding(
                "C03",
                f"bool-combo:{key}",
                "Repeated boolean flag combination",
                "medium",
                "medium",
                "candidate",
                "The same set of boolean flags appears in multiple functions, which may hide a state model.",
                {
                    "summary": f"Flags {key} appear together in {len(users)} functions.",
                    "details": users,
                },
                [],
                key.split("+"),
            )
        )


def collect_exceptions(findings: list[dict[str, Any]], tree: ast.AST, relative: str) -> None:
    for node in ast.walk(tree):
        if not isinstance(node, ast.ExceptHandler):
            continue
        classify_except(findings, node, relative)


def classify_except(findings: list[dict[str, Any]], handler: ast.ExceptHandler, relative: str) -> None:
    body = handler.body
    if except_rethrows(body) or except_translates(body):
        return
    owner = owner_name(handler)
    logs = has_log_call(body)
    returns = [stmt for stmt in body if isinstance(stmt, ast.Return)]
    return_expr = ast.unparse(returns[0].value) if returns and returns[0].value is not None else None
    returns_nullish = return_expr in {None, "None"} if returns else False
    if returns and returns[0].value is None:
        returns_nullish = True
        return_expr = "None"
    empty = all(isinstance(stmt, ast.Pass) for stmt in body)
    loop_exit = any(isinstance(stmt, (ast.Break, ast.Continue)) for stmt in body)
    if empty:
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "swallowed-empty",
                ["Empty except block swallows the error."],
            )
        )
        return
    if returns_nullish and not logs:
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "swallowed-empty",
                [f"Except returns {return_expr} without reraise or translation."],
            )
        )
        return
    if returns_nullish and logs:
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "swallowed-nullish",
                [f"Except logs and returns {return_expr}. Callers cannot observe the failure."],
            )
        )
        return
    if logs and returns and not returns_nullish:
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "log-fallback",
                [
                    f"Except logs and returns fallback '{return_expr}'. This may be a legitimate boundary fallback.",
                    "Not classified as definite swallowing.",
                ],
            )
        )
        return
    if loop_exit and all(isinstance(stmt, (ast.Break, ast.Continue, ast.Pass)) for stmt in body):
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "swallowed-loop-exit",
                ["Except skips the current loop work without reraising or exposing the failure to callers."],
            )
        )
        return
    if logs and not returns and all(is_log_statement(stmt) for stmt in body):
        findings.append(
            swallow_finding(
                handler,
                relative,
                owner,
                "log-only",
                ["Except logs the error and does not reraise, translate, or change observable control flow."],
            )
        )


def except_rethrows(body: list[ast.stmt]) -> bool:
    for statement in body:
        if not isinstance(statement, ast.Raise):
            continue
        if statement.exc is None:
            return True
        if isinstance(statement.exc, ast.Name):
            return True
    return False


def except_translates(body: list[ast.stmt]) -> bool:
    for statement in body:
        if not isinstance(statement, ast.Raise) or statement.exc is None:
            continue
        if isinstance(statement.exc, ast.Call):
            return True
        if isinstance(statement.exc, ast.Name):
            continue
        return True
    return False


def has_log_call(body: list[ast.stmt]) -> bool:
    for statement in body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Call) and LOG_NAME.search(callee_name(node)):
                return True
    return False


def is_log_statement(statement: ast.stmt) -> bool:
    if isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
        return bool(LOG_NAME.search(callee_name(statement.value)))
    return False


def owner_name(handler: ast.ExceptHandler) -> str:
    parent = getattr(handler, "parent", None)
    current: ast.AST | None = parent
    while current is not None:
        if isinstance(current, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return current.name
        current = getattr(current, "parent", None)
    return "anonymous"


def attach_parents(tree: ast.AST) -> None:
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            setattr(child, "parent", node)


def collect_imports(files: list[dict[str, str]]) -> list[dict[str, str]]:
    known = {file["relative"] for file in files}
    edges: list[dict[str, str]] = []
    for file in files:
        relative = file["relative"]
        try:
            tree = ast.parse(read_text(file["path"]), filename=relative)
        except (SyntaxError, OSError):
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    target = resolve_module(relative, alias.name, 0, known)
                    if target:
                        edges.append({"from": relative, "to": target})
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                target = resolve_module(relative, module, node.level, known)
                if target:
                    edges.append({"from": relative, "to": target})
    return edges


def resolve_module(importer: str, module: str, level: int, known: set[str]) -> str | None:
    parts = importer.split("/")
    base = parts[:-1]
    if level:
        if level - 1 > len(base):
            return None
        package = base[: len(base) - (level - 1)]
        names = [piece for piece in module.split(".") if piece] if module else []
        candidates = module_candidates(package + names)
    else:
        if not module:
            return None
        candidates = module_candidates(module.split("."))
    matches: list[str] = []
    for candidate in candidates:
        if candidate in known:
            return candidate
        matches.extend(
            path for path in known if path == candidate or path.endswith("/" + candidate)
        )
    unique = list(dict.fromkeys(matches))
    if len(unique) == 1:
        return unique[0]
    return None


def module_candidates(parts: list[str]) -> list[str]:
    if not parts:
        return []
    path = "/".join(parts)
    return [f"{path}.py", f"{path}/__init__.py"]


def finding(
    rule_id: str,
    identity: str,
    title: str,
    severity: str,
    confidence: str,
    status: str,
    explanation: str,
    evidence: dict[str, Any],
    locations: list[dict[str, Any]],
    symbols: list[str],
) -> dict[str, Any]:
    return {
        "ruleId": rule_id,
        "identity": identity,
        "title": title,
        "severity": severity,
        "confidence": confidence,
        "status": status,
        "explanation": explanation,
        "evidence": evidence,
        "locations": locations,
        "affectedSymbols": symbols,
    }


def swallow_finding(
    handler: ast.ExceptHandler,
    relative: str,
    owner: str,
    kind: str,
    details: list[str],
) -> dict[str, Any]:
    return finding(
        "D03",
        f"{kind}:{relative}:{owner}",
        "Possible boundary fallback",
        "medium",
        "medium",
        "candidate",
        details[0],
        {"summary": details[0], "details": details},
        [location(relative, handler, owner)],
        [owner] if owner else [],
    )


def location(relative: str, node: ast.AST, symbol: str | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {
        "file": relative,
        "line": getattr(node, "lineno", 1),
        "column": getattr(node, "col_offset", 0) + 1,
    }
    if symbol:
        item["symbol"] = symbol
    return item


def stable_text(node: ast.AST, source: str) -> str:
    text = ast.get_source_segment(source, node) or ast.unparse(node)
    return re.sub(r"\s+", " ", text).strip()[:80]


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass


@dataclass(frozen=True)
class CompileResult:
    compiled: bool
    stdout: str
    stderr: str
    exit_code: int | None
    command: list[str]


@dataclass(frozen=True)
class RunResult:
    ran: bool
    stdout: str
    stderr: str
    exit_code: int | None
    command: list[str]


MAX_SOURCE_CHARS = int(os.environ.get("ALGO_MAX_SOURCE_CHARS", "50000"))
MAX_STDIN_CHARS = int(os.environ.get("ALGO_MAX_STDIN_CHARS", "10000"))
MAX_OUTPUT_CHARS = int(os.environ.get("ALGO_MAX_OUTPUT_CHARS", "20000"))

_BLOCKED_PATTERNS: dict[str, list[str]] = {
    "python": [
        r"\bimport\s+subprocess\b",
        r"\bfrom\s+subprocess\s+import\b",
        r"\bimport\s+socket\b",
        r"\bfrom\s+socket\s+import\b",
        r"\bimport\s+ctypes\b",
        r"\bfrom\s+ctypes\s+import\b",
        r"\bos\.system\s*\(",
    ],
    "java": [
        r"\bRuntime\.getRuntime\s*\(",
        r"\bProcessBuilder\s*\(",
        r"\bjava\.net\.",
        r"\bjava\.nio\.file\.",
    ],
    "cpp": [
        r"\b(system|popen|fork|execv|execl|execlp|execvp|CreateProcess)\s*\(",
        r"#\s*include\s*<\s*winsock2\.h\s*>",
        r"#\s*include\s*<\s*sys/socket\.h\s*>",
    ],
}


def _truncate(s: str, limit: int) -> str:
    if not s:
        return ""
    if len(s) <= limit:
        return s
    return s[:limit] + "\n...<truncated>..."


def _safe_env() -> dict[str, str]:
    # Минимальное окружение — чтобы уменьшить “случайные” зависимости.
    keep = ["PATH", "SystemRoot", "WINDIR", "COMSPEC"]
    env: dict[str, str] = {}
    for k in keep:
        v = os.environ.get(k)
        if v:
            env[k] = v
    env.setdefault("LANG", "C")
    env.setdefault("LC_ALL", "C")
    # Не наследуем прокси/пользовательские хосты, чтобы код не получил сетевые “подсказки” из окружения.
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
    ]:
        env.pop(key, None)
    return env


def _validate_payload(language: str, code: str, stdin: str) -> str | None:
    if len(code or "") > MAX_SOURCE_CHARS:
        return f"Код слишком большой: максимум {MAX_SOURCE_CHARS} символов."
    if len(stdin or "") > MAX_STDIN_CHARS:
        return f"Входные данные слишком большие: максимум {MAX_STDIN_CHARS} символов."

    lang = _norm_lang(language)
    patterns = _BLOCKED_PATTERNS.get(lang, [])
    for pattern in patterns:
        if re.search(pattern, code or "", flags=re.IGNORECASE | re.MULTILINE):
            return "Код содержит потенциально опасные операции и отклонён политикой безопасности."
    return None


def _limit_resources_unix(memory_mb: int, cpu_s: int):
    # Best-effort: работает только на Unix. На Windows ограничиваем только timeout-ом.
    try:
        import resource  # type: ignore
    except Exception:
        return None

    def _preexec():
        # CPU time
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
        # Address space (virtual memory)
        mem_bytes = int(memory_mb) * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        # file size
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))

    return _preexec


def compile_cpp(
    code: str,
    compiler: str = "g++",
    timeout_s: int = 10,
    memory_mb: int = 512,
) -> CompileResult:
    """
    Компиляция C++ кода без запуска.
    Возвращает результат компиляции и вывод компилятора.
    """
    compiler_path = shutil.which(compiler) or shutil.which(f"{compiler}.exe")
    if not compiler_path:
        return CompileResult(
            compiled=False,
            stdout="",
            stderr=f'Компилятор "{compiler}" не найден в PATH.',
            exit_code=None,
            command=[compiler],
        )

    with tempfile.TemporaryDirectory(prefix="algo_compile_") as tmp:
        src_path = os.path.join(tmp, "main.cpp")
        out_path = os.path.join(tmp, "main.exe" if os.name == "nt" else "main")

        with open(src_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        cmd = [
            compiler_path,
            "-std=c++17",
            "-O2",
            src_path,
            "-o",
            out_path,
        ]

        preexec_fn = None
        if os.name != "nt":
            preexec_fn = _limit_resources_unix(memory_mb=memory_mb, cpu_s=timeout_s)

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=tmp,
                env=_safe_env(),
                preexec_fn=preexec_fn,
            )
        except subprocess.TimeoutExpired:
            return CompileResult(
                compiled=False,
                stdout="",
                stderr=f"Компиляция превысила лимит времени ({timeout_s}с).",
                exit_code=None,
                command=cmd,
            )
        except OSError as e:
            return CompileResult(
                compiled=False,
                stdout="",
                stderr=f"Не удалось запустить компилятор: {e}",
                exit_code=None,
                command=cmd,
            )

        # ограничим размер вывода, чтобы не раздувать ответ API
        stdout = _truncate(proc.stdout or "", MAX_OUTPUT_CHARS)
        stderr = _truncate(proc.stderr or "", MAX_OUTPUT_CHARS)
        compiled = proc.returncode == 0
        return CompileResult(
            compiled=compiled,
            stdout=stdout,
            stderr=stderr,
            exit_code=proc.returncode,
            command=cmd,
        )


def run_cpp(
    code: str,
    stdin: str = "",
    compiler: str = "g++",
    compile_timeout_s: int = 10,
    run_timeout_s: int = 2,
    memory_mb: int = 256,
) -> tuple[CompileResult, RunResult]:
    """
    Компилирует и запускает C++ код в “базово безопасном” режиме:
    - таймауты
    - запуск в temp-директории
    - урезанное окружение
    - ограничение вывода
    - на Unix: лимиты CPU/памяти/размера файла
    """
    payload_err = _validate_payload(language="cpp", code=code, stdin=stdin)
    if payload_err:
        cr = CompileResult(compiled=False, stdout="", stderr=payload_err, exit_code=None, command=[])
        rr = RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])
        return cr, rr

    compiler_path = shutil.which(compiler) or shutil.which(f"{compiler}.exe")
    if not compiler_path:
        cr = CompileResult(
            compiled=False,
            stdout="",
            stderr=f'Компилятор "{compiler}" не найден в PATH.',
            exit_code=None,
            command=[compiler],
        )
        rr = RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])
        return cr, rr

    with tempfile.TemporaryDirectory(prefix="algo_run_") as tmp:
        src_path = os.path.join(tmp, "main.cpp")
        out_path = os.path.join(tmp, "main.exe" if os.name == "nt" else "main")

        with open(src_path, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        compile_cmd = [
            compiler_path,
            "-std=c++17",
            "-O2",
            src_path,
            "-o",
            out_path,
        ]

        compile_preexec = None
        if os.name != "nt":
            compile_preexec = _limit_resources_unix(memory_mb=memory_mb, cpu_s=compile_timeout_s)

        try:
            compile_proc = subprocess.run(
                compile_cmd,
                capture_output=True,
                text=True,
                timeout=compile_timeout_s,
                cwd=tmp,
                env=_safe_env(),
                preexec_fn=compile_preexec,
            )
        except subprocess.TimeoutExpired:
            cr = CompileResult(
                compiled=False,
                stdout="",
                stderr=f"Компиляция превысила лимит времени ({compile_timeout_s}с).",
                exit_code=None,
                command=compile_cmd,
            )
            return cr, RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])
        except OSError as e:
            cr = CompileResult(
                compiled=False,
                stdout="",
                stderr=f"Не удалось запустить компилятор: {e}",
                exit_code=None,
                command=compile_cmd,
            )
            return cr, RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])

        cr = CompileResult(
            compiled=(compile_proc.returncode == 0),
            stdout=_truncate(compile_proc.stdout or "", MAX_OUTPUT_CHARS),
            stderr=_truncate(compile_proc.stderr or "", MAX_OUTPUT_CHARS),
            exit_code=compile_proc.returncode,
            command=compile_cmd,
        )
        if not cr.compiled:
            return cr, RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])

        run_preexec = None
        if os.name != "nt":
            run_preexec = _limit_resources_unix(memory_mb=memory_mb, cpu_s=run_timeout_s)

        run_cmd = [out_path]
        try:
            run_proc = subprocess.run(
                run_cmd,
                input=stdin or "",
                capture_output=True,
                text=True,
                timeout=run_timeout_s,
                cwd=tmp,
                env=_safe_env(),
                preexec_fn=run_preexec,
            )
        except subprocess.TimeoutExpired:
            rr = RunResult(
                ran=False,
                stdout="",
                stderr=f"Запуск превысил лимит времени ({run_timeout_s}с).",
                exit_code=None,
                command=run_cmd,
            )
            return cr, rr
        except OSError as e:
            rr = RunResult(
                ran=False,
                stdout="",
                stderr=f"Не удалось запустить программу: {e}",
                exit_code=None,
                command=run_cmd,
            )
            return cr, rr

        rr = RunResult(
            ran=True,
            stdout=_truncate(run_proc.stdout or "", MAX_OUTPUT_CHARS),
            stderr=_truncate(run_proc.stderr or "", MAX_OUTPUT_CHARS),
            exit_code=run_proc.returncode,
            command=run_cmd,
        )
        return cr, rr


def _norm_lang(language: str) -> str:
    lang = (language or "").strip().lower()
    if lang in ["c++", "cpp", "cxx"]:
        return "cpp"
    if lang in ["python", "py"]:
        return "python"
    if lang in ["java"]:
        return "java"
    return lang


def _validate_java_class_name(code: str) -> str | None:
    match = re.search(r"public\s+class\s+(\w+)", code or "")
    if match and match.group(1) != "Main":
        name = match.group(1)
        return (
            f'Публичный класс должен называться Main (файл Main.java), а не {name}. '
            "Переименуйте класс в Main или уберите модификатор public."
        )
    return None


def _which_or_err(bin_name: str, err_label: str) -> tuple[str | None, str | None]:
    p = shutil.which(bin_name) or shutil.which(f"{bin_name}.exe")
    if not p:
        return None, f'{err_label} "{bin_name}" не найден в PATH.'
    return p, None


def compile_python(code: str, timeout_s: int = 5) -> CompileResult:
    with tempfile.TemporaryDirectory(prefix="algo_py_compile_") as tmp:
        src = os.path.join(tmp, "main.py")
        with open(src, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        py, err = _which_or_err("python", 'Интерпретатор')
        if err:
            return CompileResult(False, "", err, None, ["python"])

        cmd = [py, "-m", "py_compile", src]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=tmp,
                env=_safe_env(),
            )
        except subprocess.TimeoutExpired:
            return CompileResult(False, "", f"Проверка синтаксиса превысила лимит ({timeout_s}с).", None, cmd)
        except OSError as e:
            return CompileResult(False, "", f"Не удалось запустить python: {e}", None, cmd)

        return CompileResult(
            compiled=(proc.returncode == 0),
            stdout=_truncate(proc.stdout or "", MAX_OUTPUT_CHARS),
            stderr=_truncate(proc.stderr or "", MAX_OUTPUT_CHARS),
            exit_code=proc.returncode,
            command=cmd,
        )


def run_python(code: str, stdin: str = "", run_timeout_s: int = 2, memory_mb: int = 256) -> tuple[CompileResult, RunResult]:
    payload_err = _validate_payload(language="python", code=code, stdin=stdin)
    if payload_err:
        cr = CompileResult(compiled=False, stdout="", stderr=payload_err, exit_code=None, command=[])
        rr = RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])
        return cr, rr

    cr = compile_python(code=code, timeout_s=5)
    if not cr.compiled:
        return cr, RunResult(False, "", "", None, [])

    with tempfile.TemporaryDirectory(prefix="algo_py_run_") as tmp:
        src = os.path.join(tmp, "main.py")
        with open(src, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        py, err = _which_or_err("python", 'Интерпретатор')
        if err:
            return CompileResult(False, "", err, None, ["python"]), RunResult(False, "", "", None, [])

        preexec = _limit_resources_unix(memory_mb=memory_mb, cpu_s=run_timeout_s) if os.name != "nt" else None
        cmd = [py, "-I", src]
        try:
            proc = subprocess.run(
                cmd,
                input=stdin or "",
                capture_output=True,
                text=True,
                timeout=run_timeout_s,
                cwd=tmp,
                env=_safe_env(),
                preexec_fn=preexec,
            )
        except subprocess.TimeoutExpired:
            return cr, RunResult(False, "", f"Запуск превысил лимит времени ({run_timeout_s}с).", None, cmd)
        except OSError as e:
            return cr, RunResult(False, "", f"Не удалось запустить python: {e}", None, cmd)

        return cr, RunResult(True, _truncate(proc.stdout or "", MAX_OUTPUT_CHARS), _truncate(proc.stderr or "", MAX_OUTPUT_CHARS), proc.returncode, cmd)


def compile_java(code: str, timeout_s: int = 10) -> CompileResult:
    class_err = _validate_java_class_name(code)
    if class_err:
        return CompileResult(False, "", class_err, None, ["javac"])

    with tempfile.TemporaryDirectory(prefix="algo_java_compile_") as tmp:
        src = os.path.join(tmp, "Main.java")
        with open(src, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        javac, err = _which_or_err("javac", 'Компилятор')
        if err:
            return CompileResult(False, "", err, None, ["javac"])

        cmd = [javac, src]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=tmp,
                env=_safe_env(),
            )
        except subprocess.TimeoutExpired:
            return CompileResult(False, "", f"Компиляция превысила лимит времени ({timeout_s}с).", None, cmd)
        except OSError as e:
            return CompileResult(False, "", f"Не удалось запустить javac: {e}", None, cmd)

        return CompileResult(
            compiled=(proc.returncode == 0),
            stdout=_truncate(proc.stdout or "", MAX_OUTPUT_CHARS),
            stderr=_truncate(proc.stderr or "", MAX_OUTPUT_CHARS),
            exit_code=proc.returncode,
            command=cmd,
        )


def run_java(code: str, stdin: str = "", compile_timeout_s: int = 10, run_timeout_s: int = 2, memory_mb: int = 256) -> tuple[CompileResult, RunResult]:
    payload_err = _validate_payload(language="java", code=code, stdin=stdin)
    if payload_err:
        cr = CompileResult(compiled=False, stdout="", stderr=payload_err, exit_code=None, command=[])
        rr = RunResult(ran=False, stdout="", stderr="", exit_code=None, command=[])
        return cr, rr

    class_err = _validate_java_class_name(code)
    if class_err:
        cr = CompileResult(compiled=False, stdout="", stderr=class_err, exit_code=None, command=[])
        return cr, RunResult(False, "", "", None, [])

    with tempfile.TemporaryDirectory(prefix="algo_java_run_") as tmp:
        src = os.path.join(tmp, "Main.java")
        with open(src, "w", encoding="utf-8", newline="\n") as f:
            f.write(code or "")

        javac, err = _which_or_err("javac", 'Компилятор')
        if err:
            cr = CompileResult(False, "", err, None, ["javac"])
            return cr, RunResult(False, "", "", None, [])

        compile_cmd = [javac, src]
        try:
            proc = subprocess.run(
                compile_cmd,
                capture_output=True,
                text=True,
                timeout=compile_timeout_s,
                cwd=tmp,
                env=_safe_env(),
            )
        except subprocess.TimeoutExpired:
            cr = CompileResult(False, "", f"Компиляция превысила лимит времени ({compile_timeout_s}с).", None, compile_cmd)
            return cr, RunResult(False, "", "", None, [])
        except OSError as e:
            cr = CompileResult(False, "", f"Не удалось запустить javac: {e}", None, compile_cmd)
            return cr, RunResult(False, "", "", None, [])

        cr = CompileResult(
            compiled=(proc.returncode == 0),
            stdout=_truncate(proc.stdout or "", MAX_OUTPUT_CHARS),
            stderr=_truncate(proc.stderr or "", MAX_OUTPUT_CHARS),
            exit_code=proc.returncode,
            command=compile_cmd,
        )
        if not cr.compiled:
            return cr, RunResult(False, "", "", None, [])

        java, err2 = _which_or_err("java", 'Среда выполнения')
        if err2:
            return cr, RunResult(False, "", err2, None, ["java"])

        preexec = _limit_resources_unix(memory_mb=memory_mb, cpu_s=run_timeout_s) if os.name != "nt" else None
        run_cmd = [java, "-cp", tmp, "Main"]
        try:
            run_proc = subprocess.run(
                run_cmd,
                input=stdin or "",
                capture_output=True,
                text=True,
                timeout=run_timeout_s,
                cwd=tmp,
                env=_safe_env(),
                preexec_fn=preexec,
            )
        except subprocess.TimeoutExpired:
            return cr, RunResult(False, "", f"Запуск превысил лимит времени ({run_timeout_s}с).", None, run_cmd)
        except OSError as e:
            return cr, RunResult(False, "", f"Не удалось запустить java: {e}", None, run_cmd)

        return cr, RunResult(True, _truncate(run_proc.stdout or "", MAX_OUTPUT_CHARS), _truncate(run_proc.stderr or "", MAX_OUTPUT_CHARS), run_proc.returncode, run_cmd)


def compile_code(language: str, code: str, compiler: str | None = None) -> CompileResult:
    lang = _norm_lang(language)
    if lang == "cpp":
        return compile_cpp(code=code, compiler=compiler or "g++", timeout_s=10)
    if lang == "python":
        return compile_python(code=code, timeout_s=5)
    if lang == "java":
        return compile_java(code=code, timeout_s=10)
    return CompileResult(False, "", f"Язык не поддерживается: {language}", None, [])


def run_code(
    language: str,
    code: str,
    stdin: str = "",
    compiler: str | None = None,
    compile_timeout_s: int = 10,
    run_timeout_s: int = 2,
    memory_mb: int = 256,
) -> tuple[CompileResult, RunResult]:
    lang = _norm_lang(language)
    if lang == "cpp":
        return run_cpp(
            code=code,
            stdin=stdin,
            compiler=compiler or "g++",
            compile_timeout_s=compile_timeout_s,
            run_timeout_s=run_timeout_s,
            memory_mb=memory_mb,
        )
    if lang == "python":
        return run_python(code=code, stdin=stdin, run_timeout_s=run_timeout_s, memory_mb=memory_mb)
    if lang == "java":
        return run_java(
            code=code,
            stdin=stdin,
            compile_timeout_s=compile_timeout_s,
            run_timeout_s=run_timeout_s,
            memory_mb=memory_mb,
        )
    cr = CompileResult(False, "", f"Язык не поддерживается: {language}", None, [])
    rr = RunResult(False, "", "", None, [])
    return cr, rr

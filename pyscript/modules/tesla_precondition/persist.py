# pyscript module: file I/O must be compiled and run off the event loop.
import os

@pyscript_compile
def _read_text(path):
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

@pyscript_compile
def _write_text(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)   # atomic

@pyscript_executor
def read_text(path):
    return _read_text(path)

@pyscript_executor
def write_text(path, text):
    _write_text(path, text)

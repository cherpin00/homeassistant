import os

@pyscript_compile
def _read(path):
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

@pyscript_compile
def _write(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)

@pyscript_executor
def read_text(path):
    return _read(path)

@pyscript_executor
def write_text(path, text):
    _write(path, text)

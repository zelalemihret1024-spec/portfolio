#!/usr/bin/env python3
"""Builds public/index.html and public/admin.html from src/ (each becomes one self-contained file)."""
import pathlib
R = pathlib.Path(__file__).parent
S = R / 'src'
rd = lambda n: (S / n).read_text(encoding='utf-8')
shared, app, css = rd('shared.js'), rd('app.js'), rd('site.css')
for t in (shared, app):
    assert '</script' not in t
idx = rd('index.src.html').replace('/*CSS*/', css).replace('/*SHARED*/', shared).replace('/*APP*/', app)
adm = rd('admin.src.html').replace('<!--SHARED-->', '<script>' + shared + '</script>')
(R / 'public' / 'index.html').write_text(idx, encoding='utf-8')
(R / 'public' / 'admin.html').write_text(adm, encoding='utf-8')
(R / 'public' / '_worker.js').write_text((R / 'worker.js').read_text(encoding='utf-8'), encoding='utf-8')
print('built', len(idx), len(adm))

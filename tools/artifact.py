"""After `vite build`: writes the artifact page (no html/head/body wrapper) and prints the JS bundle name."""
import re, os, sys
out = sys.argv[1]
d = sys.argv[2] if len(sys.argv) > 2 else 'dist'
s = open(d + '/index.html').read()
title = re.search(r'<title>.*?</title>', s, re.S).group(0)
style = re.search(r'<style>.*?</style>', s, re.S).group(0).replace('<style>', '<style>\n:root{color-scheme:dark;padding:0!important}\nhtml,body{height:100%}\n')
scripts = ''.join(re.findall(r'<script[^>]*src="[^"]+"[^>]*></script>', s))
body = re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>', '', re.search(r'<body>(.*?)</body>', s, re.S).group(1))
open(out, 'w').write(f'{title}\n{style}\n{body}\n{scripts}\n')
print(os.listdir(d + '/assets'))

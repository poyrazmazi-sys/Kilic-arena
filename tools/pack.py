"""Packs binary assets (GLB models, HDR skies) into base64 JSON so any static host serves them."""
import base64, json, os, glob
os.makedirs('assets_src', exist_ok=True)
for f in glob.glob('public/models/*.glb') + glob.glob('public/sky/*.bin'):
    b = open(f, 'rb').read()
    json.dump({'b64': base64.b64encode(b).decode()}, open(os.path.splitext(f)[0] + '.json', 'w'))
    os.replace(f, os.path.join('assets_src', os.path.basename(f)))
    print('packed', f, len(b) // 1024, 'KB')

export type Lang = 'en' | 'tr';
const T: Record<string, [string, string]> = {
  start: ['Begin', 'Başla'], resume: ['Click to continue', 'Devam etmek için tıkla'],
  easy: ['Easy', 'Kolay'], normal: ['Normal', 'Normal'], hard: ['Hard', 'Zor'],
  intro1: ['Constantinople, May 1453', 'Kostantiniyye, Mayıs 1453'],
  intro2: ['Davud, a young janissary, fights along the outer wall. Explore the walls, the moat and the Ottoman camp. Raise four banners at the glowing beams, grab the supply drops, then defeat the captain.', 'Genç yeniçeri Davud dış surda savaşıyor. Surları, hendeği ve Osmanlı ordugâhını keşfet. Parlayan ışıklarda dört sancağı dik, ikmal sandıklarını topla, sonra kaptanı yen.'],
  note: ['A fictional arcade mode. The rifle is deliberately out of its time.', 'Kurgusal bir arcade modu. Tüfek bilerek çağının dışında.'],
  obj: ['Raise the banners', 'Sancakları dik'], objBoss: ['Defeat the captain', 'Kaptanı yen'], elims: ['Eliminations', 'Etkisiz'], raised: ['Banner raised', 'Sancak dikildi'], raising: ['Raising the banner', 'Sancak dikiliyor'], contested: ['Clear the enemies first', 'Önce düşmanı temizle'], supply: ['Supply drop on the wall', 'Sura ikmal sandığı düştü'], got: ['Ammunition and bandages', 'Cephane ve sargı'],
  wave: ['Counterattack', 'Karşı saldırı'], boss: ['The Genoese captain', 'Cenevizli kaptan'],
  hold: ['Hold the tower', 'Kuleyi tut'], bombard: ['The great gun speaks', 'Büyük top konuşuyor'],
  dead: ['You have fallen. Click to rise again.', 'Düştün. Yeniden kalkmak için tıkla.'],
  win1: ['The banner is raised', 'Sancak dikildi'],
  win2: ['The tower holds. Tomorrow, the breach.', 'Kule elimizde. Yarın, gedik.'],
  again: ['Click to play again', 'Yeniden oynamak için tıkla'],
  s_come: ['They are coming along the wall!', 'Surdan geliyorlar!'], s_reload: ['Reload, Davud!', 'Doldur Davud!'],
  s_cross: ['Crossbows on the inner wall! Take cover!', 'İç surda tatar yayları! Siper al!'], s_gun: ['Stand clear, the great gun!', 'Açılın, büyük top!'],
  s_capt: ['Their captain! Bring him down!', 'Kaptanları! İndirin onu!'], s_allah: ['Forward, lions of the Sultan!', 'İleri, Sultanın aslanları!'],
  controls: ['WASD move · Mouse look · Click fire · Right click aim / block · R reload · 1 rifle · 2 sword · Shift sprint · Space jump (twice for double jump) · V camera view · L language. No mouse capture? Arrow keys look, F fire, E aim.', 'WASD yürü · Fare bak · Tık ateş · Sağ tık nişan / savun · R doldur · 1 tüfek · 2 kılıç · Shift koş · Boşluk zıpla (iki kez: çift zıplama) · V kamera · L dil. Fare yakalanmazsa: ok tuşları bak, F ateş, E nişan.'],
  loading: ['Reloading', 'Dolduruluyor'], look: ['Look', 'Görünüm'],
};
import { load, save } from './store';
export let lang: Lang = (load('lang') as Lang) || 'en';
export const setLang = (l: Lang) => { lang = l; save('lang', l); };
export const t = (k: string) => (T[k] ? T[k][lang === 'en' ? 0 : 1] : k);

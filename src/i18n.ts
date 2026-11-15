export type Lang = 'en' | 'tr';
const T: Record<string, [string, string]> = {
  start: ['Begin', 'Başla'], resume: ['Click to continue', 'Devam etmek için tıkla'],
  easy: ['Easy', 'Kolay'], normal: ['Normal', 'Normal'], hard: ['Hard', 'Zor'],
  intro1: ['Constantinople, May 1453', 'Kostantiniyye, Mayıs 1453'],
  intro2: ['Davud, a young janissary, has taken a tower of the outer wall with his orta. Hold it until the banner is raised.', 'Genç yeniçeri Davud, ortasıyla birlikte dış surun bir kulesini ele geçirdi. Sancak dikilene kadar kuleyi tut.'],
  note: ['A fictional story set within the real siege.', 'Gerçek kuşatmanın içinde geçen kurgusal bir hikâye.'],
  wave: ['Counterattack', 'Karşı saldırı'], boss: ['The Genoese captain', 'Cenevizli kaptan'],
  hold: ['Hold the tower', 'Kuleyi tut'], bombard: ['The great gun speaks', 'Büyük top konuşuyor'],
  dead: ['You have fallen. Click to rise again.', 'Düştün. Yeniden kalkmak için tıkla.'],
  win1: ['The banner is raised', 'Sancak dikildi'],
  win2: ['The tower holds. Tomorrow, the breach.', 'Kule elimizde. Yarın, gedik.'],
  again: ['Click to play again', 'Yeniden oynamak için tıkla'],
  s_come: ['They are coming along the wall!', 'Surdan geliyorlar!'], s_reload: ['Load your musket, Davud!', 'Tüfeğini doldur Davud!'],
  s_cross: ['Crossbows on the inner wall! Take cover!', 'İç surda tatar yayları! Siper al!'], s_gun: ['Stand clear, the great gun!', 'Açılın, büyük top!'],
  s_capt: ['Their captain! Bring him down!', 'Kaptanları! İndirin onu!'], s_allah: ['Forward, lions of the Sultan!', 'İleri, Sultanın aslanları!'],
  controls: ['WASD move · Mouse look · Click fire · Right click aim / block · R reload · 1 musket · 2 sword · Shift sprint · L language', 'WASD yürü · Fare bak · Tık ateş · Sağ tık nişan / savun · R doldur · 1 tüfek · 2 kılıç · Shift koş · L dil'],
  loading: ['Reloading', 'Dolduruluyor'], look: ['Look', 'Görünüm'],
};
export let lang: Lang = (localStorage.getItem('j1453.lang') as Lang) || 'en';
export const setLang = (l: Lang) => { lang = l; localStorage.setItem('j1453.lang', l); };
export const t = (k: string) => (T[k] ? T[k][lang === 'en' ? 0 : 1] : k);

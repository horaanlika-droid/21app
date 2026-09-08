'use strict';
/* Координаты: парсинг в боте, хранение, синхронизация с картой в клиенте.
   Запуск: node bot/test-geo.js */
const fs=require('fs'),os=require('os'),path=require('path');
const {AdminBot}=require('./admin-bot');
const {Store}=require('./store');

let bad=0; const ok=(n,c)=>{if(!c)bad++;console.log((c?'✓ ':'✗ ')+n);};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'geo-'));
const store=new Store(path.join(tmp,'b.json'),{saveDelay:0});
const bot=new AdminBot({token:'X',store,adminId:'1',log:()=>{}});
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const XY=[48.7894,44.7783];

console.log('— разбор координат в боте —');
ok('точка-разделитель', eq(bot.parseXY('48.7894, 44.7783'),XY));
ok('пробел-разделитель', eq(bot.parseXY('48.7894 44.7783'),XY));
ok('русская раскладка: десятичная запятая', eq(bot.parseXY('48,7894 44,7783'),XY));
ok('запятая везде', eq(bot.parseXY('48,7894, 44,7783'),XY));
ok('ссылка Яндекс.Карт (ll=долгота,широта)',
   eq(bot.parseXY('https://yandex.ru/maps/?ll=44.778300%2C48.789400&z=17'),XY));
ok('ссылка Google Maps (@широта,долгота)',
   eq(bot.parseXY('https://maps.google.com/@48.7894,44.7783,17z'),XY));
ok('текст отклонён', bot.parseXY('во дворе у 19-го')===null);
ok('одно число отклонено', bot.parseXY('48.7894')===null);
ok('широта > 90 отклонена', bot.parseXY('91 44')===null);
ok('долгота > 180 отклонена', bot.parseXY('48 181')===null);
ok('отрицательные координаты', eq(bot.parseXY('-33.8688 151.2093'),[-33.8688,151.2093]));

console.log('\n— хранение —');
const t=store.createTask({type:'fix',title:'Точка',x:48.789412,y:44.779533},1);
ok('точность не теряется', t.x===48.789412&&t.y===44.779533);
ok('по умолчанию — центр района',
   (()=>{const d=store.createTask({type:'fix',title:'X'},1);return d.x===48.7894&&d.y===44.7783;})());
store.updateTask(t.id,{x:48.7,y:44.7},1);
ok('координаты редактируются', store.getTask(t.id).x===48.7);
store.flush();
ok('переживают перезапуск',
   new Store(path.join(tmp,'b.json'),{saveDelay:0}).getTask(t.id).x===48.7);

console.log('\n— клиент: карта и метка —');
const h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
ok('карта выбора в админке', h.includes('id="apPickMap"'));
ok('карта выбора в заявке жителя', h.includes("el('div', 'pickmap')"));
ok('метка перетаскивается', (h.match(/draggable: true/g)||[]).length>=2);
ok('клик по карте ставит метку', (h.match(/events\.add\('click'/g)||[]).length>=2);
ok('перетаскивание пишет в поля', (h.match(/dragend/g)||[]).length>=2);
ok('ручной ввод двигает метку', h.includes('syncMark')&&h.includes('pickSetMark'));
ok('точность полей 6 знаков', /toFixed\(6\)/.test(h));
ok('валидация диапазона', h.includes('Math.abs(lat) > 90'));
ok('метки на общей карте обновляются', h.includes('refreshStaticList(); refreshMarkers();'));
ok('кнопка «моё местоположение»', h.includes('apPickHere'));
ok('фолбэк без карты', h.includes('Карта недоступна'));

console.log('\n— QR удалён полностью —');
for(const [n,pat] of [['кодер','QR21'],['отрисовка','drawQR'],['стикеры','openSticker'],
                      ['кнопка в шапке','btnHdrQR'],['плитка','tileQR'],['печать','printZone'],
                      ['стили стикера','sticker-box']]) ok('нет: '+n, !h.includes(pat));
ok('tools/qr.js удалён', !fs.existsSync(path.join(__dirname,'..','tools','qr.js')));

fs.rmSync(tmp,{recursive:true,force:true});
console.log(bad?'\nFAIL: '+bad:'\nOK: координаты синхронизированы с картой, QR удалён');
process.exit(bad?1:0);

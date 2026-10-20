# Portfolio

Статичний сайт-портфоліо без залежностей. Контент лежить у `content/`, зображення в `public/images/`, а `node scripts/build.mjs` збирає все в папку `dist/`.

## Структура

```
content/
  site.json            тексти головної, About, Contact, навичок, кнопок
  projects/*.md        по одному файлу на проєкт
public/
  assets/style.css     стилі
  images/projects/<slug>/…   картинки проєктів
scripts/
  build.mjs            генератор сайту
  dev.mjs              локальний сервер з автоперезбіркою
```

## Локальний запуск

Потрібен Node 20 або новіший.

```bash
node scripts/dev.mjs      # http://localhost:4321, перезбирається при змінах
node scripts/build.mjs    # одноразова збірка в dist/
```

## Як додати новий проєкт

1. Скопіюй `content/projects/healix.md` у `content/projects/<назва>.md` і заповни поля зверху (`title`, `order`, `type`, `year`, `summary`, `images`).
2. Під рядком `---` напиши опис. Кожен заголовок `## …` стає розділом кейсу, підтримуються абзаци, списки `- `, **жирний** текст і посилання.
3. Поклади зображення в `public/images/projects/<назва>/` (наприклад `01.png` … `06.png`).
4. Запусти `node scripts/build.mjs`: якщо якоїсь картинки бракує, збірка виведе попередження з іменем файлу.
5. Закоміть і запуш у GitHub, сайт оновиться сам.

Поля проєкту:

| Поле | Що робить |
| --- | --- |
| `order` | позиція у списку на головній (нумерація 01, 02… рахується автоматично) |
| `page: false` | проєкт є у списку, але без сторінки кейсу |
| `previewUrl` | якщо заповнено, на сторінці з'являється кнопка Watch Preview |
| `cover` | картинка в блоці More Cases (за замовчуванням перша з `images`) |

## Деплой

Підійде Vercel, Netlify або Cloudflare Pages. Усюди налаштування однакові:

- репозиторій: `mirroxxe/Portfolio`
- Build command: `node scripts/build.mjs`
- Output directory: `dist`

У репозиторії вже є `vercel.json` і `netlify.toml`, тож Vercel та Netlify підхоплять це автоматично. Власний домен підключається в налаштуваннях хостингу (Domains).

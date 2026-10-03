<p align="center">
  <a href="https://threejs.org/"><img alt="Three.js" src="https://img.shields.io/badge/Three.js-r169-000000?logo=three.js&logoColor=white"></a>
  <a href="https://developer.mozilla.org/ru/docs/Web/API/WebGL_API"><img alt="WebGL2" src="https://img.shields.io/badge/WebGL2-3A87A8?logo=mdn&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-Apache_2.0-blue.svg"></a>
  <img alt="Dependencies" src="https://img.shields.io/badge/dependencies-0-success">
</p>

<h1 align="center">Burrow3D</h1>
<p align="center">Превращает ASCII-карту в объёмную местность: рельеф, вода, 19 готовых объектов и 7 наборов оформления</p>

---

Карта — это JSON с сеткой символов. Движок читает её, назначает каждому символу один из трёх типов клетки (свободная / дорога / занятая) и расставляет по ней объекты: деревья, камни, кактусы, грибы, ледяные шпили. Рельеф, небо, вода и свет — всё параметризовано, размер и форма карты произвольны.

Ни сборки, ни зависимостей: `index.html` открывается двойным кликом. Three.js подтягивается с CDN.

- **Любая карта** — свой JSON или встроенные демо; символы любые, легенда назначается в интерфейсе
- **Три типа клеток** — свободная (рельеф), дорога (выравнивается и проседает), занятая (непроходимая, поднимается в массив)
- **7 наборов оформления** — Лес-Поле, Пустыня, Горы, Марсианская пустыня, Болота Венеры, Ледник, Грибная чаща
- **19 объектов** — хвойные, лиственные, сосны, кактусы, сухой кустарник, камыш, грибы, кристаллы, базальт, наледь, галька, валуны
- **Свободная камера** — орбита и полёт от первого лица (`WASD`, `Space`/`C`, `Shift`)
- **Слои, миникарта, сохранение карты** с приведённой легендой

## Быстрый старт

Открыть `index.html` в браузере. Нужен интернет только при первой загрузке (CDN).

Свою карту — перетащи `.json` в окно или кнопка «Загрузить». Формат:

```json
{ "version": 1, "name": "my-map", "width": 40, "height": 28,
  "grid": ["..##..", "..##..", "......"] }
```

Смысл символов в файле не хранится — три слота легенды в панели назначаются вручную (`.` `#` `X` подставляются автоматически, если они есть в карте).

## Скриншоты

<p align="center">
  <img src="docs/screenshot-ui.jpg" alt="Интерфейс" width="820">
</p>

<p align="center">
  <img src="docs/biome-mountains.jpg" alt="Горы" width="410">
  <img src="docs/biome-mars.jpg" alt="Марсианская пустыня" width="410">
</p>
<p align="center">
  <img src="docs/biome-venus.jpg" alt="Болота Венеры" width="410">
  <img src="docs/biome-fungal.jpg" alt="Грибная чаща" width="410">
</p>
<p align="center">
  <img src="docs/biome-desert.jpg" alt="Пустыня" width="410">
  <img src="docs/biome-glacier.jpg" alt="Ледник" width="410">
</p>

Размер карты произвольный — 56×28 и 40×40:

<p align="center">
  <img src="docs/map-arena.jpg" alt="Карта 56×28" width="410">
  <img src="docs/map-isle.jpg" alt="Карта 40×40" width="410">
</p>

## Управление

| Действие | Как |
|----------|-----|
| Вращать / тянуть / зум | ЛКМ / ПКМ / колесо |
| Полёт от первого лица | `F` или кнопка, затем `WASD`, `Space`/`C`, `Shift` |
| Сменить набор оформления | выпадающий список «Набор» |
| Сменить карту | «Загрузить .json», перетаскивание или список демо |
| Переназначить символы | три списка в блоке «Легенда карты» |
| Перейти по миникарте | клик |
| Скрыть панель | `H` |

## Документация

- [`docs/CONTEXT.md`](docs/CONTEXT.md) — состояние проекта, открытые проблемы, журнал
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — архитектурные решения
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — история изменений
- [`AGENTS.md`](AGENTS.md) — инструкции для агентов

## Стек

| Слой | Решение |
|------|---------|
| Рендер | Three.js r169, WebGL2, ACESFilmic, PMREM-IBL |
| Геометрия | `InstancedMesh` + `mergeGeometries`, ~20–21 тыс. объектов в кадре |
| Рельеф | value-noise fbm, ridged-мультифрактал для гор |
| Сборка | нет — три статических файла, importmap |
| Зависимости | только three.js с CDN |

## Статус

**v0.2.0** — загрузка произвольных карт, легенда символов, 7 наборов оформления, 19 объектов, слои, сохранение карты.

## Лицензия

[Apache-2.0](LICENSE) © Alexander Kuzikov

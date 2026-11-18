# SOLAR DUEL — prototyp FPS 3D i 1v1 przez Internet

Grywalny prototyp bez krwi. Dwa tryby: **trening z botem** oraz **1v1 z zaproszeniem po nicku**. HTML/JavaScript/Three.js + mały serwer Node.js obsługujący sieć. Gracze mogą korzystać z **zupełnie różnych sieci Wi-Fi, operatorów i miast** — muszą tylko wejść na ten sam publiczny adres serwera.

## Uruchomienie lokalnie (Windows / macOS / Linux)

1. Zainstaluj Node.js 18+ z https://nodejs.org/ (jeśli jeszcze go nie masz).
2. Otwórz terminal w folderze z plikami `package.json`, `server.js` i `public`.
3. Wykonaj:
   ```
   npm install
   npm start
   ```
4. Otwórz **http://localhost:3000** w przeglądarce Chrome lub Edge.
5. Trening z botem działa od razu. Możesz przetestować zaproszenia lokalnie, otwierając dwie karty i wybierając dwa różne nicki.

**Uwaga:** nie otwieraj `public/index.html` przez dwuklik (`file://`). Gra musi być serwowana przez Node.js.

## Jak grać ze znajomym, który jest w INNEJ sieci?

`localhost` działa tylko na Twoim komputerze. Aby obie osoby połączyły się przez Internet, uruchom **ten sam serwer na hostingu Node.js z publicznym adresem HTTPS** (np. Render, Railway, VPS). Hosting musi obsługiwać WebSocket i `npm start`. Ustaw zmienną `PORT` tylko jeśli wymaga tego hosting. Kod automatycznie używa `wss://` pod HTTPS.

Gdy hosting poda adres, np. `https://twoja-gra.example`, wykonajcie:
1. Oboje otwieracie **ten sam adres** (każdy w swojej sieci).
2. Każdy wpisuje **inny nick** i klika **Połącz z serwerem**.
3. Gracz A wpisuje nick gracza B i klika **Zaproś**.
4. Gracz B dostaje zaproszenie i klika **Akceptuj**.
5. Rozpoczyna się wspólny pojedynek 1v1. Wygrywa osoba, która jako pierwsza zdobędzie 10 eliminacji.

Bez publicznego hostingu **nie będzie działał** multiplayer między różnymi sieciami. Prototyp nie zakłada automatycznie hostingu i nie otwiera portów routera.

## Sterowanie

| Klawisz | Akcja |
|---|---|
| WASD | Chodzenie |
| Mysz | Obrót kamery |
| Lewy przycisk myszy | Strzał / cios |
| SHIFT | Sprint |
| SPACJA | Skok |
| 1 | Karabin (30 nabojów) |
| 2 | Pistolet (15 nabojów) |
| 3 | Nóż |
| R | Przeładowanie |
| ESC | Uwolnienie myszy |

## Technicznie

- Gra jest renderowana przez WebGL, Three.js, oświetlenie kierunkowe, proceduralnie modelowaną arenę, cienie, lekkie efekty promieni słońca i cząstek pyłu.
- Odgłosy strzałów są **syntetyzowane** przez Web Audio API, są więc uproszczone — to nie nagrane dźwięki prawdziwej broni.
- Brak krwi; trafienia to iskry, licznik HP i animacja HUD.
- Online to prototyp: serwer weryfikuje szybkość strzału i przybliżoną linię trafienia, ale nie zapewnia pełnej ochrony anty-cheat, kont, bazy danych czy matchmakingu.
- Nie ma mechanizmu gwarantującego 800 FPS. `requestAnimationFrame` w przeglądarce często ogranicza FPS do częstotliwości odświeżania ekranu (VSync). Wydajność zależy od komputera i ustawień.
- Ustawienie PERFORMANCE ogranicza złożoność wyświetlania, a CINEMATIC wymaga więcej zasobów GPU. Większe zużycie GPU samo w sobie **nie zwiększa** FPS — przeciwnie, może je obniżać.

## Pliki

- `public/index.html` — menu i HUD gry.
- `public/game.js` — świat 3D, bot, sterowanie, broń, efekty i klient sieciowy.
- `server.js` — serwer WWW, nicki, zaproszenia i synchronizacja 1v1.
- `package.json` — biblioteki Three.js i `ws`.

Pierwsza wersja — punkt wyjścia do rozwijania grafiki, mapy, fizyki, animacji i stabilności sieci.

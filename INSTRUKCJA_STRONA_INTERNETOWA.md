# SOLAR DUEL — opublikowanie gry jako strony internetowej

**Gracze nie instalują Node.js.** Po opublikowaniu gry obaj korzystają z jednej strony HTTPS, nawet będąc w innych sieciach Wi-Fi.

## Wersja z darmowym adresem strony (GitHub + Render)

1. Wejdź na https://github.com i zaloguj się / utwórz konto.
2. Kliknij **New repository**, nazwij je np. `solar-duel`, wybierz prywatne lub publiczne i utwórz repozytorium.
3. Kliknij **Add file → Upload files**. Rozpakuj paczkę ZIP na komputerze, a następnie prześlij **wszystkie pliki i foldery z jej wnętrza** do katalogu głównego repozytorium, w tym `render.yaml`, `server.js`, `package.json` i folder `public`. Kliknij **Commit changes**.
4. Wejdź na https://dashboard.render.com i zaloguj się przez GitHub.
5. Kliknij **New → Web Service**, połącz konto GitHub i wybierz repozytorium `solar-duel`.
6. Gdy Render pyta o ustawienia: **Language / Runtime: Node**, **Build Command: `npm install`**, **Start Command: `npm start`**, **Instance type: Free** (jeżeli dostępne). Możesz użyć automatycznego wykrywania konfiguracji `render.yaml` albo wpisać ustawienia ręcznie.
7. Kliknij **Deploy Web Service / Create Web Service**. Po pomyślnym wdrożeniu Render pokaże publiczny adres `https://<nadana-nazwa>.onrender.com` — to rzeczywisty link do Twojej gry, który możesz wysłać koledze.

## Granie online

1. Każdy gracz otwiera dokładnie ten sam publiczny link z Render.
2. Każdy wpisuje swój nick i łączy się z serwerem.
3. Gracz 1 wpisuje nick gracza 2 i wysyła zaproszenie; gracz 2 akceptuje.
4. Zaczyna się pojedynek 1v1. Bot działa w trybie treningu.

## Ważne informacje

- **Adres `https://solar-duel.onrender.com` nie jest gwarantowany**: Render przydziela adres zależnie od dostępności nazwy.
- Darmowy plan Render może usypiać serwer po okresie bezczynności; ponowne otwarcie strony może trwać dłużej. Bezpłatna usługa może mieć inne ograniczenia.
- To prototyp: połączenia 1v1 wymagają działającego publicznego serwera. Nie wystarczy udostępnić samego pliku HTML na hostingu statycznym.
- Jeśli chcesz własną domenę np. `mojagra.pl`, jej rejestracja może kosztować; darmowy adres `onrender.com` jest wystarczający do testów.
- Nicki nie są kontami z hasłem — na potrzeby testów nie udostępniaj przez grę prywatnych danych.

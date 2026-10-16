# Tweedekanshoek voor Android

Expo (SDK 57, React Native, Expo Router). Alleen Android; interne distributie.

## Ontwikkelen

    cd mobile
    pnpm install
    EXPO_PUBLIC_API_URL=http://<lan-ip>:3000 npx expo start --dev-client

Pushmeldingen en `expo-notifications` vragen een **development build** (geen Expo Go):
`npx eas-cli@latest build --profile development --platform android`.

## Pushmeldingen (Firebase, eenmalig)

1. Firebase-project maken, Android-app toevoegen met pakketnaam `nl.tweedekanshoek.app`.
2. `google-services.json` downloaden en in `mobile/` zetten (staat in .gitignore) of via `GOOGLE_SERVICES_JSON` aanleveren.
3. Service-account-sleutel (Projectinstellingen, Service accounts) als `FCM_SERVICE_ACCOUNT` op de server zetten (JSON of bestandspad).
4. In Beheer, Meldingstypes: "App (push)" staat standaard aan.

## Interne distributie

    npx eas-cli@latest build --profile preview --platform android   # APK voor testers

Geen Play Store in deze fase.

## Werking

- Inloggen levert een per-apparaat token (veilig opgeslagen); uitloggen of wachtwoord wijzigen trekt het in.
- Deep links: `https://tweedekanshoek.nl/product/<artikel>` en tikken op een melding openen het product.
- Haptics: tik op tabs/steppers, succes bij "Gekocht" en volgen, waarschuwing/fout bij problemen; uit te zetten onder Meer.

## Bekende afwijkingen

- `expo` 57.0.27 en `expo-router` 57.0.26 (iets achter op 57.0.29/.27) omdat pnpm `minimumReleaseAge` gloednieuwe releases weigert; `@expo/cli` en `@expo/metro-runtime` staan op de uitzonderingslijst in `pnpm-workspace.yaml` en kunnen eruit zodra ze 24 uur oud zijn.
- `expo-doctor` meldt een dubbele `react` doordat de web-app een niveau hoger staat; de bundel gebruikt alleen `mobile/node_modules`.

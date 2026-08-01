# Android Build Variants Setup

The fork keeps development and production Android applications separate while
sharing the upstream Kotlin/Compose codebase. See [README.md](README.md) for the
complete build and secret-handling instructions.

## Variant contract

| Setting | Development | Production |
| --- | --- | --- |
| Application ID | `com.bobpappas.textbee.dev` | `com.bobpappas.textbee` |
| App name | `TextBee (Dev)` | `TextBee` |
| API base URL | Required `TEXTBEE_DEV_API_BASE_URL` | `https://textbee.bobpappas.com/api/v1/` |
| Firebase input | `app/src/dev/google-services.json` | `app/src/prod/google-services.json` |
| Cleartext HTTP | Allowed for trusted-LAN development | Disabled |
| Signing | Android debug signing | External release signing |

The Java/Kotlin namespace remains `com.vernu.sms`; it is independent of the
installed application IDs.

## Development

Register the development Firebase Android app as
`com.bobpappas.textbee.dev`, place its downloaded Android client
`google-services.json` at `app/src/dev/google-services.json`, and run:

```sh
TEXTBEE_DEV_API_BASE_URL=http://MAC_LAN_IP:8080/api/v1/ \
  ./gradlew assembleDevDebug
```

The URL must be an HTTP(S) URL ending in `/api/v1/`. The development release
variant is disabled, and the development APK uses Android debug signing.

## Production

Production Firebase configuration must identify `com.bobpappas.textbee` and
must be stored at `app/src/prod/google-services.json`. A production release
requires all four external signing environment variables documented in
[README.md](README.md). Do not substitute development or sample Firebase data,
debug signing, or fabricated release keys merely to produce a production APK.

Both real Firebase files, signing keys, credentials, APKs, and build caches are
excluded from Git.

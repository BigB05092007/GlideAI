# GlideAI Android Build

This packages GlideAI as a native Android app with Capacitor. The Android app
loads the static `out/` web build from bundled assets, including the local
MediaPipe files, so swim analysis runs on-device.

## Build On Windows Or macOS

1. Install Android Studio.
2. In Android Studio, install the Android SDK and create or connect an Android
   device.
3. Make sure Java is available. Android Studio includes a JDK; if Gradle cannot
   find it, set `JAVA_HOME` to Android Studio's bundled JDK folder and restart
   your terminal.
4. From this repo, install dependencies:

   ```bash
   npm ci
   ```

5. Build and sync the bundled web app into the Android project:

   ```bash
   npm run android:prepare
   ```

6. Open the native project:

   ```bash
   npm run android:open
   ```

7. In Android Studio, select a device and run the `app` target.

## Useful Commands

```bash
npm run android:run
npm run android:build
```

The debug APK is generated under `android/app/build/outputs/apk/debug/`.

## Notes

- The Android application id is `com.glideai.mobile`.
- Camera permission is declared in `android/app/src/main/AndroidManifest.xml`.
- The copied web bundle under `android/app/src/main/assets/public` is generated
  by `npm run android:prepare` and is ignored by git.

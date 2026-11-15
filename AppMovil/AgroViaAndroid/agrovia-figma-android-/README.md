# AGROVÍA para Android

Esta app carga localmente el código exportado desde Figma Make, dentro de `app/src/main/assets/www`. No necesita publicar el prototipo ni abrir la URL temporal de Figma. Las pantallas, textos, datos de demostración y navegación provienen del código exportado.

## Abrir y ejecutar

1. Abre esta carpeta en Android Studio.
2. Sincroniza el proyecto con Gradle. Usa Gradle 9.3.1, requerido por Android Gradle Plugin 9.1.0.
3. Conecta el teléfono con depuración USB habilitada o elige un emulador.
4. Ejecuta la configuración `app`.

El contenido principal y los datos de demostración están dentro del APK. La tipografía Nunito Sans puede cargarse desde Google Fonts cuando el teléfono tiene Internet; sin conexión se usa la fuente alternativa del sistema. La ubicación y el micrófono piden permisos del teléfono cuando se usan.

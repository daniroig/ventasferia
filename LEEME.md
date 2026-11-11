# Registro de libros (app para Android)

App web instalable (PWA). Se usa desde Chrome en Android y se instala como una app más.
Escanea el ISBN con la cámara, acepta códigos manuales de 6 dígitos, guarda fecha y hora
de cada entrada y exporta a Excel (.xlsx) o CSV con las columnas
ISBN, Código, Precio, Fecha, Hora.

## Cómo ponerla en el móvil (sin programar)

La cámara solo funciona si la app está en una dirección https, así que hay que subir
esta carpeta a un alojamiento gratuito. La opción más rápida:

### Opción A: Netlify Drop (1 minuto)
1. En el ordenador, abre https://app.netlify.com/drop
2. Arrastra la carpeta `isbn-app` (descomprimida) a la página.
3. Te da una dirección tipo `https://nombre-aleatorio.netlify.app`. Ábrela en el móvil.

### Opción B: GitHub Pages
1. Crea un repositorio público en github.com y sube todos los archivos de esta carpeta.
2. En Settings > Pages, elige la rama `main` y la carpeta `/ (root)`.
3. Abre la dirección que te muestra en el móvil.

## Instalar en el móvil
1. Abre la dirección en Chrome para Android.
2. Menú (tres puntos) > "Instalar aplicación" o "Añadir a pantalla de inicio".
3. Al pulsar "Activar cámara" por primera vez, acepta el permiso de cámara.

## Uso
- **Entrada**: activa la cámara con el botón de debajo de la imagen y apunta al código de barras. Suena un pitido y el ISBN aparece en el campo "ISBN escaneado". Si quieres, escribe el precio en el campo de al lado y pulsa **Añadir** para guardarlo. Si no quieres guardar ese ISBN, bórralo con la tecla de retroceso. Tras añadir, el ISBN y el precio se vacían. "Último registro" solo muestra lo último guardado; el precio se edita en Registros.
- **Código manual**: escribe 6 dígitos, el precio si quieres, y pulsa "Añadir".
- **Registros**: lista completa donde puedes tocar un registro para editar su precio en la misma línea, botón de borrar por registro y exportación a .xlsx o .csv
  (se guardan en la carpeta Descargas del móvil).

## Importante
- Los datos se guardan en el propio navegador del móvil, no en internet. Si borras los
  datos de Chrome o desinstalas la app, se pierden: exporta con frecuencia.
- Los datos no se comparten entre dispositivos.
- Para actualizar la app, sube los archivos de nuevo y cambia el nombre de la caché en
  `sw.js` (`libros-v6` por `libros-v7`).

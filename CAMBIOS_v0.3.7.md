# Cambios v0.3.7

## Cámara / Coach
- Conteo estricto: hay que estar en posición inicial y quieto (se "arma"), recorrer ≥70 % del ROM, duración y velocidad razonables, sin movimientos erráticos; si se pierde el cuerpo la rep se anula. Los movimientos aleatorios ya no suman.
- Descanso: al cumplir las reps (o con el botón "Terminar → descanso") se apagan cámara y detección de pose, cuenta atrás con ±15 s, vibración al terminar y nueva serie automática.

## Salud / Health Connect
- 1.188.000 kcal: se leía `inCalories` antes que `inKilocalories` (units.ts).
- Kcal basal 0: Mi Fitness no escribe BMR; ahora se estima con Mifflin-St Jeor del perfil.
- Pasos 9916 vs 9958: se descartaban records legítimos del mismo minuto (dedupeExact).
- FC: tarjeta "FC actual" (última muestra) y "FC reposo" aparte.
- % grasa: se busca por separado en 90 días y tolera formato número/objeto; si no hay, usa el manual del perfil.
- "client is not initialized": inicialización única con promesa compartida + reintento.
- Lectura paginada, aviso de permisos que faltan (Peso, % Grasa, Estatura).
- Refresco en vivo cada 20 s y al volver a la app.

## Nuevo
- Perfil: objetivos Perder grasa / Mantener / Ganar peso / Hipertrofia, experiencia y % grasa manual.
- "Mi plan": calorías, macros, rutina, pasos y sueño según el perfil (Nutrición usa las mismas cifras).
- "Análisis físico": foto + pose → proporciones/simetría + datos → enfócate en perder/ganar/mejorar.

## Otros bugs
- Escáner de código de barras: importaba una función inexistente (crash al pulsar Añadir).
- Export: nombre de archivo con fecha local (no UTC); tipos corregidos.
- Eliminado CameraScreen.tsx.backup.

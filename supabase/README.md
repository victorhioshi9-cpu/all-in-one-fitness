# Supabase · Setup para Fase 2

## 1. Crear proyecto

1. Ve a https://supabase.com y crea un nuevo proyecto (Free tier OK).
2. Espera a que el endpoint `https://<tu-proyecto>.supabase.co` esté activo.
3. En **Project Settings → API** copia:
   - `Project URL` → `EXPO_PUBLIC_SUPABASE_URL`
   - `anon` public key → `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## 2. Aplicar el schema

Opción A — SQL Editor (rápido):
   1. Abre el SQL Editor en el dashboard.
   2. Pega el contenido de `schema.sql` y ejecuta.

Opción B — Supabase CLI:
   ```bash
   npm i -g supabase
   supabase login
   supabase link --project-ref <project-ref>
   cp schema.sql supabase/migrations/00001_init.sql
   supabase db push
   ```

## 3. RLS basado en deviceId (sin Auth)

Cada dispositivo genera un `deviceId` único en el primer arranque (ver `src/modules/cloud/deviceIdentity.ts`) y lo guarda en `expo-secure-store`.

En cada sesión de Supabase, el cliente llama primero a la RPC `set_device_context(deviceId)` para poblar el GUC `app.current_device_id`. Las políticas RLS (`using (device_id = current_setting('app.current_device_id', true))`) filtran automáticamente todas las queries por ese deviceId.

Esto evita pantallas de login (probamos el APK en el gym de inmediato) pero **NO es seguro contra un atacante que conozca tu deviceId**: un atacante podría leer tus datos si adivina o captura tu deviceId. Para producción (Fase 3+) hay que migrar a Supabase Auth + JWT.

## 4. Variables en EAS

`.env.example` ya declara las variables. EAS inyecta automáticamente las vars `EXPO_PUBLIC_*` en el bundle en build time.

```bash
cp .env.example .env
# Rellena .env con tus credenciales
eas build --profile preview --platform android
```

## 5. Verificar

Tras el primer arranque del APK en el dispositivo, en el dashboard de Supabase debería aparecer una fila en `devices` y, al finalizar un entrenamiento, filas en `workouts` y `sets`.

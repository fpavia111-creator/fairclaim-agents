# Agentes Remedy para facturación médica

*Traducido por Claude; pendiente de revisión por un hablante nativo. El [README](README.md) en inglés es el de referencia.*

Treinta pequeños agentes MCP para facturación médica (sistema de salud de EE. UU., ciclo de ingresos). Cada uno se encarga de **una sola tarea**, como revisar reclamaciones antes de enviarlas, ordenar las denegaciones de un archivo 835, encontrar líneas pagadas de menos o trabajar el informe de saldos a favor, y no puede actuar fuera de ella. Leen los archivos que ya exporta de su sistema de gestión, su cámara de compensación y los portales de los pagadores (837, 835, 999, 277CA, 271, 278 u hojas de cálculo), enmascaran los identificadores de pacientes antes de que un resultado llegue al modelo de IA, escriben listas de trabajo en su equipo y esperan a una persona identificada antes de enviar, reembolsar, contabilizar o pagar nada.

Licencia MIT · Node 20 o posterior · solo archivos locales · sin credenciales · sin dependencias · solo datos de prueba ficticios

## Pruébelo

```bash
npx -y sage-of-claims demo          # revisión de reclamaciones con datos ficticios
npx -y yarrow-of-denials demo       # lista de denegaciones a partir de un 835 ficticio
```

Cada agente tiene una `demo` con archivos ficticios, un `eval` con sus propios casos de prueba y un servidor MCP (`npx -y <agente> mcp --root <carpeta>`) para Claude Desktop, Claude Code, Cursor y otros hosts MCP. Los nombres de columnas también se reconocen en español; los informes HTML están en español con `--lang es`.

## Los agentes

**Antes de enviar la reclamación:** `marjoram-of-registration` (registro y seguro del paciente), `basil-of-eligibility` (respuestas de elegibilidad 271), `mint-of-authorizations` (autorizaciones previas y 278), `borage-of-estimates` (estimaciones de buena fe para pacientes sin seguro), `clover-of-charges` (visitas sin cargo), `sage-of-claims` (revisión de reclamaciones), `dill-of-modifiers` (modificadores), `ginger-of-edits` (ediciones NCCI publicadas por CMS), `anise-of-dental` (odontología), `caraway-of-anesthesia` (unidades de anestesia), `cumin-of-dme` (equipo médico y alquileres), `tarragon-of-labs` (laboratorio, CLIA), `lovage-of-telehealth` (telesalud), `nettle-of-audits` (auditorías de codificación).

**Después de enviarla:** `verbena-of-rejects` (rechazos 999 y 277CA), `chamomile-of-ar` (cuentas por cobrar y plazos de presentación), `fennel-of-remits` (835 frente a depósitos bancarios), `yarrow-of-denials` (denegaciones por causa), `rosemary-of-appeals` (borradores de apelación), `thyme-of-underpayments` (pagos insuficientes según el contrato), `tansy-of-credits` (saldos a favor y reembolsos), `aloe-of-statements` (estados de cuenta de pacientes), `savory-of-plans` (planes de pago).

**Dirigir la consulta:** `hyssop-of-fees` (tarifas frente a Medicare), `laurel-of-contracts` (contratos con pagadores), `sorrel-of-payers` (cuadros de mando por pagador), `lavender-of-credentialing` (acreditaciones y vencimientos), `angelica-of-prices` (archivo de transparencia de precios de hospitales), `mallow-of-kpis` (indicadores frente a sus propios objetivos), `vervain-of-onboarding` (preparación para el arranque de una nueva consulta).

## Datos de pacientes

Los resultados van a un modelo de IA, así que cada agente enmascara antes los identificadores de pacientes (`--phi mask`, por defecto): nombres, números de afiliado y de historia se convierten en seudónimos estables (`PT-3f9a1c2e`), las fechas de nacimiento en el año de nacimiento; direcciones, teléfonos, correos y números de seguro social se eliminan, también en texto libre. Los archivos de informe en su disco conservan los nombres reales. Esto mantiene la PHI lejos del modelo; no es una determinación de cumplimiento de HIPAA. Sus acuerdos (BAA) y políticas siguen aplicándose.

## Cómo se mantienen seguros

- **Lista de permitidos por agente.** Cada agente solo puede llamar a sus propias herramientas.
- **Herramientas rechazadas.** Enviar reclamaciones, contabilizar pagos, emitir reembolsos e iniciar sesión en portales de pagadores están nombradas y bloqueadas.
- **Un clic con nombre.** Estados de cuenta, apelaciones, solicitudes de reembolso y aceptar reglas aprendidas esperan a una persona identificada, incluso en modo Auto.
- **Memoria que solo endurece.** Una regla aprendida se aplica solo tras la aprobación de una persona y solo puede añadir controles.
- **Registro de auditoría** en `.remedy/`, encadenado por hash, firmado con Ed25519 si lo configura. **Parada de emergencia:** `<agente> kill`.

## Cómo se prueban

Cada agente tiene sus propias pruebas, las mismas pruebas de contrato que los demás (entre ellas: ningún identificador de paciente de los datos de prueba en ningún resultado) y de 8 a 13 casos de prueba con archivos ficticios. Cada caso con hojas de cálculo se repite como exportación alemana, francesa, española, brasileña, italiana, japonesa, china y coreana, y se insertan datos hostiles en los archivos de cada agente. [REVIEW-ver1.md](REVIEW-ver1.md) (en inglés) enumera todas las comprobaciones.

## Límites

- Cada agente trabaja solo con los archivos que usted le da y no inicia sesión en ningún pagador, cámara de compensación, sistema de gestión ni banco.
- Las tablas de códigos, reglas de pagadores y tarifas están tan actualizadas como lo que usted cargue. Las reglas de ejemplo integradas no son la política de ningún pagador.
- No es asesoramiento de codificación, legal, de cumplimiento ni médico. Las personas deciden y actúan.

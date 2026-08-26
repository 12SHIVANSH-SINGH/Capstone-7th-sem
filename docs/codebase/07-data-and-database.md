# Data and database

MongoDB via Mongoose is the only confirmed persistence technology. Database provisioning, migrations, indexes created outside schemas, and seed data are **UNKNOWN**.

| Model | Confirmed fields/behavior |
| --- | --- |
| `User` | required `name`, unique required `email`, required password, role `student`/`teacher`, optional passkey credential metadata. Pre-save hashes changed password; model can sign JWT. |
| `Location` | room number plus exactly four latitude/longitude pairs when created by controller. Coordinates are rounded to 12 decimal places by schema setters. No room uniqueness constraint. |
| `UniqueCode` | globally unique `code`, `batch`, `year`, `course`, `room`, all required. |

There is no attendance-record model. Do not infer the existence of an attendance history table/collection from the UI's static dashboard arrays.

## Confirmed implementation mismatch

Code controller operations query/test `expiresAt` and calculate a 10-minute value, but `UniqueCode` defines no `expiresAt` and creation does not pass it to the model. A commented cron cleanup also refers to that field. Expiry and cleanup are therefore incomplete/nonfunctional as written; exact database behavior should be tested against a disposable database.

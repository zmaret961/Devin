# ShopFast

Monorepo for the ShopFast commerce platform.

| Service          | Path                 | Owner team     |
|------------------|----------------------|----------------|
| checkout-api     | services/api         | checkout       |
| auth-service     | services/auth        | identity       |
| payment-worker   | services/worker      | payments       |
| catalog-api      | services/catalog     | catalog        |
| shared libraries | packages/db, packages/shared | platform |

Service ownership, dependencies and runbooks live in `catalog/services.json`.
Run the test suite with `npm test`.

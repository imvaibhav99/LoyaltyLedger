# LoyaltyLedger — Claude Code Standards

## Code style: Classes with static arrow functions

Every controller and service MUST follow this pattern. No exceptions.

### Rule

- Define a `class` with `static` arrow function properties (not methods).
- Export the class as a **default export**.
- Import with a **default import** (never `import * as ...`).
- Module-private helpers (e.g. `issueTokens`) stay as `const` arrow functions at the top of the file — they do NOT go on the class.

### Controller template

```js
import { asyncHandler } from '../utils/asyncHandler.js';
import FooService from '../services/fooService.js';

class FooController {

  static create = asyncHandler(async (req, res) => {
    const data = await FooService.create({ tenantId: req.user.tenantId, ...req.body });
    res.status(201).json({ success: true, data });
  });

  static list = asyncHandler(async (req, res) => {
    const data = await FooService.list({ tenantId: req.user.tenantId });
    res.json({ success: true, data });
  });

}

export default FooController;
```

### Service template

```js
import { ApiError } from '../utils/ApiError.js';

class FooService {

  static create = async ({ tenantId, ...fields }) => {
    // ...
  };

  static list = async ({ tenantId }) => {
    // ...
  };

}

export default FooService;
```

### Route file import style

```js
import FooController from '../controllers/fooController.js';

router.post('/', FooController.create);
router.get('/',  FooController.list);
```

### What NOT to do

```js
// WRONG — named exports
export async function login() {}
export const login = async () => {};

// WRONG — namespace import
import * as authController from '../controllers/authController.js';

// WRONG — regular class methods (use static arrow functions instead)
class Foo {
  static async create(req, res) {}
}
```

## General rules

- Stack: Node 20, Express 4, ESM (`"type": "module"`), Mongoose 8, MongoDB Atlas, React 18 + Vite + Tailwind, JWT, bcryptjs, zod, node-cron.
- Never move to the next implementation phase until the current one runs without error.
- All DB writes in a multi-step flow use a Mongoose session + `withTransaction`.
- All routes are tenant-scoped: every query includes `tenantId: req.user.tenantId`.
- Controllers are thin — no business logic, just call the service and send the response.
- Services hold all business logic — no `req`/`res` references ever.
- No comments unless the WHY is genuinely non-obvious.

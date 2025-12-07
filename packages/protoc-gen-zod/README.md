# protoc-gen-zod

A Buf plugin that generates Zod v4 schemas from Protocol Buffer definitions with `buf.validate` annotation support.

## Features

- Generates TypeScript Zod schemas from `.proto` files
- Supports `buf.validate` (protovalidate) annotations for validation rules
- Maps proto types to appropriate Zod types
- Imports enums from generated `*_pb.ts` files
- Compatible with Zod v4+

## Installation

```bash
npm install protoc-gen-zod
```

## Usage

Add to your `buf.gen.yaml`:

```yaml
plugins:
  # Generate Zod schemas
  - local: ./node_modules/.bin/protoc-gen-zod
    out: ./src/gen
    opt: target=ts
```

Or use a local path:

```yaml
plugins:
  - local: ../packages/protoc-gen-zod/bin/protoc-gen-zod.js
    out: ../frontend/src/gen
    opt: target=ts
```

## Proto Type Mappings

| Proto Type | Zod Type |
|------------|----------|
| `string` | `z.string()` |
| `int32/int64` | `z.number().int()` |
| `float/double` | `z.number()` |
| `bool` | `z.boolean()` |
| `bytes` | `z.instanceof(Uint8Array)` |
| `enum` | `z.nativeEnum()` |
| `message` | `z.object()` or schema reference |
| `repeated` | `z.array()` |
| `optional` | `.optional()` |
| `map<K,V>` | `z.record()` |

## Validation Mappings

| buf.validate | Zod |
|--------------|-----|
| `string.min_len` | `.min()` |
| `string.max_len` | `.max()` |
| `string.pattern` | `.regex()` |
| `string.email` | `.email()` |
| `string.uuid` | `.uuid()` |
| `int32.gte/lte` | `.gte()/.lte()` |
| `enum.defined_only` | `.refine(v => v !== 0)` |

## Example

**Input** (`user.proto`):
```protobuf
import "buf/validate/validate.proto";

message CreateUserRequest {
  string email = 1 [(buf.validate.field).string.email = true];
  string name = 2 [(buf.validate.field).string.min_len = 1];
  int32 age = 3 [(buf.validate.field).int32.gte = 0];
}
```

**Output** (`user_zod.ts`):
```typescript
import { z } from "zod";

export const CreateUserRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  age: z.number().int().gte(0),
});

export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test with buf generate
cd ../proto && buf generate
```

## License

MIT

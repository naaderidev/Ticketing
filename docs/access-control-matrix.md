# Access Control Matrix

Status: enforced policy

The route proxy provides an early authentication check. It is not the authorization source of truth. Route handlers call the server-side authorization boundary, which loads the current user and role from MySQL.

## Page access

| Page | Anonymous | USER | ADMIN | Enforcement |
| --- | --- | --- | --- | --- |
| `/` | Allow | Allow | Allow | Public page |
| `/user/login` | Allow | Allow | Allow | Public page |
| `/user/signup` | Allow | Allow | Allow | Public page |
| `/user/**` | Redirect to login | Allow | Allow | Proxy; data is protected again by API authorization |
| `/admin/**` | Redirect to login | Deny | Allow | Proxy authentication plus database-backed admin layout check |
| `/forbidden` | Allow | Allow | Allow | Public error page |

## Authentication and user APIs

| Operation | Anonymous | USER | ADMIN |
| --- | --- | --- | --- |
| Login | Allow | Allow | Allow |
| Signup | Allow; always creates USER | Allow; always creates USER | Allow; always creates USER |
| Logout | Allow | Allow | Allow |
| Current user | Deny | Self | Self |
| Refresh session | Deny | Self | Self |
| List/create users | Deny | Deny | Allow |
| Change user role | Deny | Deny | Allow |

## Ticket permissions

| Permission | Anonymous | USER owner | USER non-owner | ADMIN |
| --- | --- | --- | --- | --- |
| List | Deny | Own tickets only | Not applicable | All tickets |
| Create | Deny | For self | Not applicable | For self or a selected user |
| Read | Deny | Allow | Hide as 404 | Allow |
| Reply | Deny | Allow | Hide as 404 | Allow |
| Close | Deny | Allow | Hide as 404 | Allow |
| Change status/transfer | Deny | Deny | Hide as 404 | Allow |
| Delete | Deny | Deny | Hide as 404 | Allow |
| Rate | Deny | Allow | Hide as 404 | Deny |

The sender name, sender role, ticket owner, and closer role are derived on the server. Client-provided identity fields are not authoritative.

## Catalog and support administration

| Resource | Read | Create/update/delete |
| --- | --- | --- |
| Departments | Authenticated USER or ADMIN | ADMIN only |
| Sub-departments | Authenticated USER or ADMIN | ADMIN only |
| FAQs | Authenticated USER or ADMIN | ADMIN only |
| Predefined messages | ADMIN only | ADMIN only |

Anonymous catalog reads are intentionally disabled. This decision can be changed later by changing both the route policy and its tests.

## Notifications

| Operation | USER | ADMIN |
| --- | --- | --- |
| List | Own USER notifications | ADMIN notifications |
| Mark one as read | Own USER notification only | ADMIN notification only |
| Mark all as read | Own USER notifications only | ADMIN notifications only |

User-supplied `userId` and `recipientType` query values do not determine notification ownership.

## Uploads

Uploads require an authenticated database user. Ticket-level attachment authorization, private object storage, content inspection, and quotas remain assigned to the upload-hardening phase.

## Denial behavior

- Missing or invalid session: 401.
- Authenticated but missing role permission: 403.
- A resource belonging to another user: 404 to avoid disclosing its existence.
- The database role is authoritative; a stale JWT role does not grant access.

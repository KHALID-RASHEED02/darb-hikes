# Darb Firestore Security Specification

## 1. Data Invariants
1. **User Profile Privacy & Role Protection (`/users/{userId}`)**:
   - Users may only read their own `/users/{uid}` document; only verified Super Admins may read/list all user profiles.
   - Regular users may create their own profile ONLY with `role == "user"` and `isBanned == false` (no self-assigned `superadmin`).
   - Verified Super Admins may create their own profile with `role == "superadmin"` and may update `isBanned` or `role` on other user profiles.
   - Users may never modify their own `role`, `isBanned`, `uid`, `email`, or `createdAt`.
2. **Trip Ownership & Ban Enforcement (`/trips/{tripId}`)**:
   - Published hiking trips are publicly readable so visitors can browse trails on the home feed and details page.
   - Only authenticated, non-banned users (`isBanned == false` in `/users/{uid}`) may create trips, and `authorUid` MUST equal `request.auth.uid` with `createdAt == request.time`.
   - Only the trip owner (if not banned) or a Super Admin may update `notes` on a trip; `authorUid` and `createdAt` are strictly immutable.
   - Only the trip owner or a Super Admin may delete a trip.
3. **Comment Master Gate (`/trips/{tripId}/comments/{commentId}`)**:
   - A comment can only be created if its parent `/trips/{tripId}` document exists, the user is authenticated and not banned, `authorUid == request.auth.uid`, and `tripId` matches the parent path variable.
   - Comments may be deleted by the comment author, parent trip owner, or a Super Admin.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Self-escalation on signup: `POST /users/{uid}` with `role: "superadmin"` by a non-admin email -> **DENIED**.
2. Self-unban update: `PATCH /users/{uid}` setting `isBanned: false` by a banned user -> **DENIED**.
3. PII scraping: `GET /users/{otherUid}` or `LIST /users` by a regular user -> **DENIED**.
4. Ghost/shadow field injection on trip creation: `POST /trips/{id}` with extra field `featured: true` -> **DENIED**.
5. Author spoofing on trip creation: `POST /trips/{id}` with `authorUid: "other-user"` -> **DENIED**.
6. Banned user posting a trip: `POST /trips/{id}` when `/users/{uid}.isBanned == true` -> **DENIED**.
7. Invalid difficulty enum: `POST /trips/{id}` with `difficulty: "extreme"` -> **DENIED**.
8. Oversized route array DoS: `POST /trips/{id}` with `routePoints.size() > 150` -> **DENIED**.
9. Backdated timestamp tampering: `POST /trips/{id}` with client timestamp `createdAt != request.time` -> **DENIED**.
10. Unauthorized trip deletion: `DELETE /trips/{id}` by a non-owner regular user -> **DENIED**.
11. Orphaned comment creation: `POST /trips/nonexistent/comments/{cid}` -> **DENIED**.
12. Unverified email spoofing Super Admin email: `LIST /users` with `email == admin` and `email_verified == false` -> **DENIED**.

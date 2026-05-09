# Security Specification - Nexus Multi-Agent Assistant

## Data Invariants
1. A thread must belong to a user (`userId` matches `request.auth.uid`).
2. A message must belong to a thread that the user has access to.
3. System agents can send messages (server-side or via specific client logic), but users cannot spoof agent identities.
4. User profile data is restricted to the owner.

## The "Dirty Dozen" Payloads
1. **Thread Spoofing**: Attempt to create a thread for another user's `userId`.
2. **Message Injection**: Attempt to write a message to a thread the user does not own.
3. **Agent Identity Theft**: Attempt to send a message with `senderType: 'agent'`.
4. **Mass Cleanup**: Attempt to delete all threads in the system.
5. **Private Data Leak**: Attempt to read integration tokens of another user.
6. **Shadow Update**: Attempt to add a `role: 'admin'` field to a user profile.
7. **Bypass Validation**: Attempt to send a message with 1MB of junk text.
8. **Broken Hierarchy**: Create a message in a non-existent thread.
9. **Time Spoofing**: Send a message with a custom `timestamp` in the future.
10. **ID Poisoning**: Create a thread with an ID that is 2KB long.
11. **PII Exposure**: Attempt to list all users' emails.
12. **Recursive Cost Attack**: Query threads with deep nested filters to spike read costs.

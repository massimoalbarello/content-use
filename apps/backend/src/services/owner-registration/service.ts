import { ownerRegistrationStatus } from '#lib/auth/owner-registration.ts';
import type { OwnerRegistrationRepository } from '#repositories/owner-registration/repository.ts';
export class OwnerRegistrationService {
  constructor(private readonly repository: OwnerRegistrationRepository) {}
  async status() {
    return ownerRegistrationStatus(await this.repository.state());
  }
}

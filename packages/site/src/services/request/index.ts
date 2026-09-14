import { MockRequestRepository } from "./mockRequestRepository";
import { ApiRequestRepository } from "./apiRequestRepository";
import type { RequestRepository } from "./RequestRepository";

export type { RequestRepository } from "./RequestRepository";

function createRequestRepository(): RequestRepository {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (apiBaseUrl) {
    return new ApiRequestRepository(apiBaseUrl);
  }
  return new MockRequestRepository();
}

export const requestRepository: RequestRepository = createRequestRepository();

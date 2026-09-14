import type { OrderRequestInput, OrderRequestResult } from "@/lib/types/request";

export interface RequestRepository {
  submit(input: OrderRequestInput): Promise<OrderRequestResult>;
}

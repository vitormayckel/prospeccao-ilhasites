import { z } from "zod";
import {
  PRIORITY,
  PIPELINE_STAGE,
  REVIEW_STATUS,
  MESSAGE_KIND,
  WHATSAPP_STATUS,
  SEARCH_PROFILE_STATUS,
} from "@/types/domain";

export const uuid = z.string().uuid();

export const priorityEnum = z.enum(PRIORITY);
export const pipelineStageEnum = z.enum(PIPELINE_STAGE);
export const reviewStatusEnum = z.enum(REVIEW_STATUS);
export const messageKindEnum = z.enum(MESSAGE_KIND);
export const whatsappStatusEnum = z.enum(WHATSAPP_STATUS);
export const searchProfileStatusEnum = z.enum(SEARCH_PROFILE_STATUS);

import { z } from 'zod';
import type { TaskPriority, TaskStatus } from '@/lib/supabase/database.types';

export const taskSchema = z.object({
  meeting_id: z.string().uuid(),
  title: z.string().min(2, 'Task title is required').max(250),
  description: z.string().max(2000).nullable().optional(),
  assignee_name: z.string().max(100).nullable().optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  status: z.enum(['todo', 'in_progress', 'done', 'cancelled']).default('todo'),
  segment_id: z.string().uuid().nullable().optional(),
  start_time: z.number().nullable().optional(),
  end_time: z.number().nullable().optional(),
  quote: z.string().nullable().optional(),
  task_nature: z.enum(['assigned', 'suggested', 'pending_confirmation']).default('assigned'),
});

export const updateTaskSchema = taskSchema.partial();

export type TaskInput = z.infer<typeof taskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export * from './service';


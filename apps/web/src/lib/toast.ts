import { toast } from 'sonner';

export function toastOk(message: string) {
  toast.success(message);
}

export function toastErr(message: string) {
  toast.error(message);
}

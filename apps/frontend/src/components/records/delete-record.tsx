import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
export function DeleteRecord({ onDelete, pending }: { onDelete: () => void; pending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="ghost" aria-label="Delete record" disabled={pending}>
            <Trash2 size={15} />
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogTitle>Delete this record?</AlertDialogTitle>
        <AlertDialogDescription>
          This permanently deletes the downloaded media and transcript. You can create a new record
          from the original URL later.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline">Cancel</Button>} />
          <AlertDialogClose
            render={
              <Button variant="destructive" onClick={onDelete}>
                Delete record
              </Button>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

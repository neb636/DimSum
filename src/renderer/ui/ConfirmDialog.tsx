import { useState, useSyncExternalStore } from "react";
import { Button, Checkbox, Dialog, Heading, Modal, ModalOverlay } from "react-aria-components";
import { IconButton } from "./controls";
import { CheckIcon, CloseIcon, TrashIcon } from "./icons";
import { answerConfirmation, pendingConfirmation, type ConfirmationRequest } from "./confirm";

/** Mounted once by the shell; shows whatever `confirmDestructive` is asking. */
export function ConfirmDialogHost() {
  const request = useSyncExternalStore(pendingConfirmation.subscribe, pendingConfirmation.get);
  // A fresh dialog per request, so its checkbox starts from the request's own default.
  return request ? <ConfirmDialog key={requestKey(request)} request={request} /> : null;
}

const keys = new WeakMap<object, number>();
let next = 0;
function requestKey(request: ConfirmationRequest): number {
  if (!keys.has(request)) keys.set(request, next++);
  return keys.get(request) ?? 0;
}

function ConfirmDialog({ request }: { request: ConfirmationRequest }) {
  const { subject, option } = request;
  const [chosen, setChosen] = useState(option?.selected ?? false);
  const finish = (confirmed: boolean) => answerConfirmation(confirmed, Boolean(option) && chosen);
  return <ModalOverlay className="wb-modal-overlay confirm-overlay" isOpen isDismissable onOpenChange={(open) => { if (!open) finish(false); }}>
    <Modal className="wb-modal wb-alert confirm-modal">
      <Dialog role="alertdialog" className="wb-dialog confirm-dialog">
        <div className="confirm-header">
          <div>
            <Heading slot="title">{request.title}</Heading>
            <p>{request.message}</p>
          </div>
          <IconButton label="Cancel" className="confirm-close" onPress={() => finish(false)}><CloseIcon size={14} /></IconButton>
        </div>
        <div className="confirm-warning" role="note"><p>{request.warning}</p></div>
        <div className="confirm-subject">
          <span className="confirm-subject-icon" aria-hidden="true">{subject.icon}</span>
          <span className="confirm-subject-copy">
            <strong>{subject.name}</strong>
            {subject.detail && <small>{subject.detail}</small>}
            {subject.meta && <code className="confirm-subject-meta" title={subject.meta}><bdi>{subject.meta}</bdi></code>}
          </span>
        </div>
        {option && <Checkbox className="wb-checkbox confirm-option" isSelected={chosen} onChange={setChosen}>
          <span className="checkbox-box"><CheckIcon size={11} /></span>
          <span className="confirm-option-copy">
            <span>{option.label}</span>
            {option.detail && <small>{option.detail}</small>}
          </span>
        </Checkbox>}
        <div className="dialog-actions confirm-actions">
          {/* Focus starts on Cancel, so Enter never removes anything by accident. */}
          <Button autoFocus className="wb-button confirm-cancel" onPress={() => finish(false)}>Cancel</Button>
          {request.tone === "caution"
            ? <Button className="wb-button primary-button" onPress={() => finish(true)}>{request.confirmLabel}</Button>
            : <Button className="wb-button danger-button" onPress={() => finish(true)}><TrashIcon size={14} />{request.confirmLabel}</Button>}
        </div>
      </Dialog>
    </Modal>
  </ModalOverlay>;
}

import { describe, expect, it, vi } from 'vitest';
import { showOpenDialog, showSaveDialog } from '../src/main/dialogs.js';

const dialog = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
}));

vi.mock('electron', () => ({ dialog }));

describe('native file panels', () => {
  it('reopen where the last one was answered, since Electron now defaults to Downloads', async () => {
    dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/talks/millivid'] });
    await showOpenDialog({ properties: ['openDirectory'] });
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith({ properties: ['openDirectory'] });

    // A bare name is placed in that folder; an absolute path is left alone.
    dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: '/exports/talk.pdf' });
    await showSaveDialog({ defaultPath: 'talk.pdf' });
    expect(dialog.showSaveDialog).toHaveBeenLastCalledWith({ defaultPath: '/talks/talk.pdf' });
    await showSaveDialog({ defaultPath: '/elsewhere/talk.pdf' });
    expect(dialog.showSaveDialog).toHaveBeenLastCalledWith({ defaultPath: '/elsewhere/talk.pdf' });

    // A cancelled panel does not move the remembered folder.
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await showOpenDialog({});
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith({ defaultPath: '/exports' });
    await showOpenDialog({});
    expect(dialog.showOpenDialog).toHaveBeenLastCalledWith({ defaultPath: '/exports' });
  });
});

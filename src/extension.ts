// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Uri } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const MAX_STAT_CALLS_PER_LINE = 20;

class FileAndPos {
	constructor(public filePath: string, public line: number | undefined, public col: number | undefined) { }
}

class TerminalLink implements vscode.TerminalLink {
	constructor(public startIndex: number, public length: number, public fap: FileAndPos) { }
}

class TerminalLinkProvider implements vscode.TerminalLinkProvider {
	constructor(private baseDirectories: string[]) {
	}
	provideTerminalLinks(context: vscode.TerminalLinkContext, token: vscode.CancellationToken): vscode.ProviderResult<TerminalLink[]> {
		return new Promise((resolve) => {
			const fileRegex = /(?=^|\s|[(])([a-zA-Z0-9~/._\-]+)(?:(?:(:[0-9]+)(:[0-9]+)?)|\(([0-9]+)[,;]?\s*([0-9]+)?\))?/g;
			const results: TerminalLink[] = [];
			let array;
			let outstandingStats = 0;
			const checkFile = (ok: boolean, offset: number, length: number, fap: FileAndPos) => {
				--outstandingStats;
				if (!token.isCancellationRequested && ok) {
					results.push(new TerminalLink(offset, length, fap));
				}
				if (outstandingStats === 0) {
					resolve(results);
				}
			};
			while ((array = fileRegex.exec(context.line)) !== null && !token.isCancellationRequested) {
				const matchIndex = fileRegex.lastIndex;
				const match = array[0];
				let line = array[2] !== undefined ? Number(array[2].substr(1)) : undefined;
				if (line === undefined && array[4] !== undefined) {
					line = Number(array[4]);
				}
				let col = array[3] !== undefined ? Number(array[3].substr(1)) : undefined;
				if (col === undefined && array[5] !== undefined) {
					col = Number(array[5]);
				}
				for (const base of this.baseDirectories) {
					const fap = new FileAndPos(path.join(base, array[1]), line, col);
					if (outstandingStats < MAX_STAT_CALLS_PER_LINE) {
						++outstandingStats;
						fs.stat(fap.filePath, (err, stats) => {
							checkFile(!err && stats.isFile(), matchIndex - match.length, match.length, fap);
						});
					}
				}
			}
			if (outstandingStats === 0) {
				resolve(results);
			}
		});
	}
	handleTerminalLink(link: TerminalLink): vscode.ProviderResult<void> {
		vscode.commands.executeCommand('vscode.open', Uri.file(link.fap.filePath)).then(() => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || link.fap.line === undefined) { return; }
			let line = link.fap.line - 1;
			if (line < 0) {
				line = 0;
			}
			let col = 0;
			if (link.fap.col !== undefined) {
				col = link.fap.col - 1;
			}
			editor.selection = new vscode.Selection(line, col, line, col);
			editor.revealRange(new vscode.Range(line, 0, line, 10000));
		});
	}
}

export function activate(context: vscode.ExtensionContext) {
	const init = () => {
		while (context.subscriptions.length > 1) {
			context.subscriptions.pop()?.dispose();
		}
		const baseDirectories = vscode.workspace.getConfiguration().get('terminalFileLink.baseDirectories') as string[];
		if (baseDirectories.length > 0) {
			context.subscriptions.push(
				vscode.window.registerTerminalLinkProvider(new TerminalLinkProvider(baseDirectories)));
		}
	};
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('terminalFileLink')) {
				init();
			}
		}));

	init();
}

export function deactivate() { }

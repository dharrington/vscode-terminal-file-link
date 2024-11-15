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
	private fileRegExp: RegExp;

	constructor(
		private logOut: vscode.OutputChannel,
		private baseDirectories: string[],
		fileRegExp: RegExp
	) {
		this.fileRegExp = fileRegExp;
	}
	provideTerminalLinks(context: vscode.TerminalLinkContext, token: vscode.CancellationToken): vscode.ProviderResult<TerminalLink[]> {
		return new Promise((resolve) => {
			const results: TerminalLink[] = [];
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
			for (const matched of context.line.matchAll(this.fileRegExp)) {
				if (token.isCancellationRequested) { break; };
				const matchIndex = (matched.indices as RegExpIndicesArray)[0][0];
				const match = matched[0];

				let line = matched[2] !== undefined ? Number(matched[2]) : undefined;
				if (line === undefined && matched[4] !== undefined) {
					line = Number(matched[4]);
				}
				let col = matched[3] !== undefined ? Number(matched[3]) : undefined;
				if (col === undefined && matched[5] !== undefined) {
					col = Number(matched[5]);
				}
				for (const base of this.baseDirectories) {
					const fap = new FileAndPos(path.join(base, matched[1]), line, col);
					if (outstandingStats < MAX_STAT_CALLS_PER_LINE) {
						++outstandingStats;
						fs.stat(fap.filePath, (err, stats) => {
							checkFile(!err && stats.isFile(), matchIndex, match.length, fap);
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
		this.logOut.appendLine("Opening " + link.fap.filePath);

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
	let logOut = vscode.window.createOutputChannel("Terminal File Link");

	const init = () => {
		while (context.subscriptions.length > 1) {
			context.subscriptions.pop()?.dispose();
		}
		let config = vscode.workspace.getConfiguration("terminalFileLink");
		let baseDirectories = config.get('baseDirectories') as string[];
		if (baseDirectories.length === 0) {
			logOut.appendLine("baseDirectories is empty, no files will be linked.");
			return;
		}
		// expand `${workspaceFolder}` references; if there are multiple
		// workspace folders, produce a copy of each base directory for each
		// workspace.
		baseDirectories = baseDirectories.reduce((acc, d) => {
			if (vscode.workspace.workspaceFolders && d.includes("${workspaceFolder}")) {
				return acc.concat(
				vscode.workspace.workspaceFolders.map(
						(wsf) => d.replace("${workspaceFolder}", wsf.uri.path)
					)
				)
			};
			return acc.concat([d]);
		}, [] as string[]);

		const fileRegex = config.get('fileRegex') as string;
		let compiledRegExp;
		try {
			compiledRegExp = new RegExp(fileRegex, 'dg');
		} catch (e) {
			logOut.appendLine("fileRegex is invalid: " + e);
			return;
		}

		logOut.appendLine("Initialized with " + baseDirectories.join(', '));

		context.subscriptions.push(
			vscode.window.registerTerminalLinkProvider(new TerminalLinkProvider(logOut, baseDirectories, compiledRegExp)));

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

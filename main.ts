import {App, MarkdownView, Notice, Plugin, PluginSettingTab, request, RequestUrlParam, Setting} from 'obsidian';
import { requestUrl } from 'obsidian';

// Remember to rename these classes and interfaces!

interface GitlabBridgePluginSettings {
	gitlabWebProjectUrl: string;
	hostGitlab: string;
	privateToken: string;
	groupSlug: string;
	projectSlug: string;
}

const DEFAULT_SETTINGS: GitlabBridgePluginSettings = {
	gitlabWebProjectUrl: 'https://gitlab.com',
	hostGitlab: '',
	privateToken: '',
	groupSlug: '',
	projectSlug: ''
}

function parseGitlabUrl(url: string): { groupSlug: string, projectSlug: string, host: string } {
	try {
		const urlObj = new URL(url);
		const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
		
		if (pathParts.length < 2) {
			throw new Error('Invalid GitLab project URL format');
		}

		return {
			groupSlug: pathParts[0],
			projectSlug: pathParts[1],
			host:  urlObj.origin
		};
	} catch (error) {
		console.error('Error parsing GitLab URL:', error);
		return {
			groupSlug: '',
			projectSlug: '',
			host: ''
		};
	}
}

export default class GitlabBridgePlugin extends Plugin {
	settings: GitlabBridgePluginSettings;

	async onload() {
		await this.loadSettings();

		// Добавляем команды в соответствии с документацией
		this.addCommand({
			id: 'share-to-gitlab-wiki',
			name: 'Share note to GitLab Wiki',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file) {
					if (!checking) {
						this.shareToGitlabWiki(view);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'get-gitlab-wiki-link',
			name: 'Get GitLab Wiki link',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file) {
					if (!checking) {
						this.getWikiLink(view);
					}
					return true;
				}
				return false;
			}
		});

		this.addCommand({
			id: 'delete-from-gitlab-wiki',
			name: 'Delete note from GitLab Wiki',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file) {
					if (!checking) {
						this.deleteFromWiki(view);
					}
					return true;
				}
				return false;
			}
		});

		this.addSettingTab(new GitlabSettingTab(this.app, this));
	}

	private getApiUrl(): string {
		return `${this.settings.hostGitlab}/api/v4/projects/${encodeURIComponent(this.settings.groupSlug)}%2F${encodeURIComponent(this.settings.projectSlug)}/wikis`;
	}

	private async shareToGitlabWiki(view: MarkdownView): Promise<void> {
		try {
			if (!view.file) return;

			const title = view.file.basename;
			const content = await this.app.vault.read(view.file);
			const url = this.getApiUrl();

			// Check if page exists
			try {
				await requestUrl({
					url: `${url}/${encodeURIComponent(title)}`,
					headers: {
						'PRIVATE-TOKEN': this.settings.privateToken
					}
				});
				
				// If page exists, update it
				await requestUrl({
					url: `${url}/${encodeURIComponent(title)}`,
					method: 'PUT',
					headers: {
						'PRIVATE-TOKEN': this.settings.privateToken,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						format: 'markdown',
						title: title,
						content: content
					})
				});
			} catch (error) {
				// If page doesn't exist, create new one
				const requestParams: RequestUrlParam = {
					url: `${url}`,
					method: 'POST',
					contentType: 'application/json',
					headers: {
						'PRIVATE-TOKEN': this.settings.privateToken
					},
					body: JSON.stringify({
						format: 'markdown',
						title: title,
						content: content
					}),
					throw: false
				}

				const result = await requestUrl(requestParams);
				console.log({result})
			}

			const wikiUrl = `${this.settings.gitlabWebProjectUrl}/${this.settings.groupSlug}%2F${this.settings.projectSlug}/-/wikis/${encodeURIComponent(title)}`;
			await navigator.clipboard.writeText(wikiUrl);
			new Notice('Successfully shared to GitLab Wiki! Link copied to clipboard.');
		} catch (error) {
			new Notice(`Error: ${error.message}`);
			console.error('GitLab Wiki error:', error);
		}
	}

	private async getWikiLink(view: MarkdownView): Promise<void> {
		if (!view.file) return;
		const title = view.file.basename;
		const wikiUrl = `${this.settings.gitlabWebProjectUrl}/${this.settings.groupSlug}%2F${this.settings.projectSlug}/-/wikis/${encodeURIComponent(title)}`;
		await navigator.clipboard.writeText(wikiUrl);
		new Notice('Wiki link copied to clipboard!');
	}

	private async deleteFromWiki(view: MarkdownView): Promise<void> {
		try {
			if (!view.file) return;
			const title = view.file.basename;

			await requestUrl({
				url: `${this.getApiUrl()}/${encodeURIComponent(title)}`,
				method: 'DELETE',
				headers: {
					'PRIVATE-TOKEN': this.settings.privateToken
				}
			});

			new Notice('Successfully deleted from GitLab Wiki!');
		} catch (error) {
			new Notice(`Error: ${error.message}`);
			console.error('GitLab Wiki deletion error:', error);
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Обновляем slugs при загрузке настроек
		const { groupSlug, projectSlug, host } = parseGitlabUrl(this.settings.gitlabWebProjectUrl);
		this.settings.groupSlug = groupSlug;
		this.settings.projectSlug = projectSlug;
		this.settings.hostGitlab = host;
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class GitlabSettingTab extends PluginSettingTab {
	plugin: GitlabBridgePlugin;

	constructor(app: App, plugin: GitlabBridgePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('GitLab Project URL')
			.setDesc('URL of your GitLab project (example: https://gitlab.com/group/project)')
			.addText(text => text
				.setPlaceholder('https://gitlab.com/group/project')
				.setValue(this.plugin.settings.gitlabWebProjectUrl)
				.onChange(async (value) => {
					this.plugin.settings.gitlabWebProjectUrl = value;
					// Automatically update slugs when URL changes
					const { groupSlug, projectSlug, host: domain } = parseGitlabUrl(value);
					this.plugin.settings.groupSlug = groupSlug;
					this.plugin.settings.projectSlug = projectSlug;
					this.plugin.settings.hostGitlab = domain;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Private Token')
			.setDesc('Your GitLab Private Token. Set token name (example: Obsidian Plugin) and select scopes: api, read_repository, write_repository')
			.addText(text => text
				.setPlaceholder('Enter your private token')
				.setValue(this.plugin.settings.privateToken)
				.onChange(async (value) => {
					this.plugin.settings.privateToken = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('Generate')
				.onClick(() => {
					const link = `https://${this.plugin.settings.hostGitlab}/${this.plugin.settings.groupSlug}/${this.plugin.settings.projectSlug}/-/settings/access_tokens?name=Obsidian+Plugin&scopes=api,read_repository,write_repository`
					window.open(link, '_blank');
				}));
	}
}

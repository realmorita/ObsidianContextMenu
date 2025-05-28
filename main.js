const { Plugin, Notice } = require('obsidian');

module.exports = class AddImagesContextMenuPlugin extends Plugin {
    async onload() {
        // コンテキストメニューに項目を追加
        this.registerEvent(
            this.app.workspace.on('editor-menu', (menu, editor, view) => {
                menu.addItem((item) => {
                    item
                        .setTitle('ローカルからコンテンツを埋め込む')
                        .setIcon('file-plus-2')
                        .onClick(async () => {
                            // electron.remote.dialogでファイル選択ダイアログを開く
                            this.openFilePickerAndInsert(editor);
                        });
                });
            })
        );
    }

    // Electronのダイアログを使用してファイルを選択し、絶対パスを取得する
    async openFilePickerAndInsert(editor) {
        // ObsidianがElectronアプリであることを利用
        // @ts-ignore
        const electron = require('electron');
        const { remote } = electron;
        
        // Electron v14以降（Obsidian v0.13.0以降）では別の方法を使用
        let dialog;
        if (remote) {
            dialog = remote.dialog;
        } else {
            // 新しいElectron APIでは@electronjs/remoteモジュールを使用する必要がある場合も
            try {
                const remoteModule = require('@electron/remote');
                dialog = remoteModule.dialog;
            } catch (e) {
                console.error('Electronダイアログを開けません:', e);
                new Notice('ファイル選択ダイアログを開けませんでした。Obsidianの最新版をご利用ください。');
                return;
            }
        }

        try {
            const result = await dialog.showOpenDialog({
                properties: ['openFile', 'multiSelections'],
                filters: [
                    { name: 'すべてのファイル', extensions: ['*'] },
                ]
            });

            if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
                for (const filePath of result.filePaths) {
                    this.insertContentWithFilePath(editor, filePath);
                }
            }
        } catch (error) {
            console.error('ファイル選択中にエラーが発生しました:', error);
            new Notice('ファイル選択中にエラーが発生しました。別の方法を試みます...');
            
            // フォールバック: 従来のHTML5 File API方式
            this.selectFilesHTML5(editor);
        }
    }

    // HTML5 File APIを使用したフォールバック方法
    async selectFilesHTML5(editor) {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = true;
            input.accept = '';
            input.onchange = (event) => {
                const target = event.target;
                if (target && target.files && target.files.length > 0) {
                    const files = Array.from(target.files);
                    for (const file of files) {
                        // objectURLでの埋め込み（フォールバック）
                        this.insertContentWithObjectUrl(editor, file);
                    }
                }
                resolve();
            };
            input.click();
        });
    }

    // 絶対パスを使用してコンテンツを挿入
    insertContentWithFilePath(editor, filePath) {
        // パス区切り文字を統一（Windowsのバックスラッシュをスラッシュに変換）
        const normalizedPath = filePath.replace(/\\/g, '/');
        // 絶対パスに必要なプレフィックスを付与
        const fileUrl = `file:///${normalizedPath}`;
        
        console.log('使用するパス:', fileUrl);
        
        // ファイル名と拡張子を取得
        const fileName = normalizedPath.split('/').pop();
        const extension = fileName.split('.').pop().toLowerCase();
        
        let embedString = '';
        
        // ファイル拡張子に基づいてコンテンツタイプを判断
        if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp'].includes(extension)) {
            // 画像ファイル
            embedString = `<img src="${fileUrl}" alt="${fileName}">`;
            new Notice(`画像ファイル "${fileName}" を埋め込みました。`);
        } else if (['mp4', 'webm', 'ogg', 'mov'].includes(extension)) {
            // 動画ファイル
            embedString = `<video controls src="${fileUrl}"></video>`;
            new Notice(`動画ファイル "${fileName}" を埋め込みました。`);
        } else if (['mp3', 'wav', 'ogg', 'aac'].includes(extension)) {
            // 音声ファイル
            embedString = `<audio controls src="${fileUrl}"></audio>`;
            new Notice(`音声ファイル "${fileName}" を埋め込みました。`);
        } else if (['html', 'pdf'].includes(extension)) {
            // HTMLファイルやPDFファイル
            embedString = `<iframe src="${fileUrl}" width="100%" height="500px" frameborder="0"></iframe>`;
            new Notice(`ファイル "${fileName}" をiframeとして埋め込みました。`);
        } else {
            new Notice(`サポートされていないファイル形式です: ${extension} (${fileName})。手動で埋め込んでください。`, 10000);
            return;
        }

        if (embedString) {
            editor.replaceSelection(embedString + '\n');
        }
    }
    
    // オブジェクトURLを使用したフォールバック方法
    insertContentWithObjectUrl(editor, file) {
        console.log('選択されたファイル (フォールバック):', file);
        
        const fileName = file.name;
        const fileType = file.type;
        const objectUrl = URL.createObjectURL(file);
        
        let embedString = '';

        if (fileType.startsWith('image/')) {
            embedString = `<img src="${objectUrl}" alt="${fileName}">`;
            new Notice(`画像ファイル "${fileName}" を埋め込みました（一時URL）。`);
        } else if (fileType.startsWith('video/')) {
            embedString = `<video controls src="${objectUrl}"></video>`;
            new Notice(`動画ファイル "${fileName}" を埋め込みました（一時URL）。`);
        } else if (fileType.startsWith('audio/')) {
            embedString = `<audio controls src="${objectUrl}"></audio>`;
            new Notice(`音声ファイル "${fileName}" を埋め込みました（一時URL）。`);
        } else if (fileType === 'text/html' || fileType === 'application/pdf') {
            embedString = `<iframe src="${objectUrl}" width="100%" height="500px" frameborder="0"></iframe>`;
            new Notice(`ファイル "${fileName}" をiframeとして埋め込みました（一時URL）。`);
        } else {
            new Notice(`サポートされていないファイル形式です: ${fileType} (${fileName})。手動で埋め込んでください。`, 10000);
            return;
        }

        if (embedString) {
            editor.replaceSelection(embedString + '\n');
        }
    }

    onunload() {
        // プラグインアンロード時の処理
    }
};

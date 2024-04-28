module.exports = {
	tabWidth: 4,
	useTabs: true,
	semi: false,
	overrides: [
		{
			files: ["*.js", "*.jsx", "*.ts", "*.tsx"],
			options: {
				semi: false,
			},
		},
	],
	"editor.formatOnSave": true,
}

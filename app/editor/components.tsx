import {
	CSSProperties,
	Dispatch,
	ReactNode,
	SetStateAction,
	createElement,
} from "react"
import { ComponentTypes, globalStyles } from "./util"
type Props = {
	activeComponent: string | null
	setActiveComponent?: Dispatch<SetStateAction<string | null>>
	id: string
	components: { [key: string]: Component }
}

function ComponentTemplate({
	activeComponent,
	setActiveComponent,
	id,
	children,
}: Props & {
	children: ReactNode
}) {
	return (
		<tr
			onClick={() => {
				setActiveComponent!(id)
			}}
		>
			{children}
		</tr>
	)
}

function Paragraph({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	const style = components[id].styles

	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td style={style} className="paragraph">
				<div
					dangerouslySetInnerHTML={{
						__html: components[id].values.text,
					}}
					style={{
						fontSize: style.fontSize,
					}}
				></div>
			</td>
		</ComponentTemplate>
	)
}

function Heading({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	const style = components[id].styles
	const type = components[id].settings.type as string
	const text = components[id].values.text

	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				{createElement(
					type,
					{
						style,
					},
					text
				)}
			</td>
		</ComponentTemplate>
	)
}

function Button({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	const style = components[id].styles
	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				<a
					onClick={(e) => {
						e.preventDefault()
					}}
					href={components[id].values.href as string}
					style={style}
				>
					{components[id].values.label}
				</a>
			</td>
		</ComponentTemplate>
	)
}

function Image({ activeComponent, setActiveComponent, id, components }: Props) {
	const style = components[id].styles
	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={components[id].values.src as string}
					alt={components[id].values.alt as string}
					style={style}
				/>
			</td>
		</ComponentTemplate>
	)
}

function Line({ activeComponent, setActiveComponent, id, components }: Props) {
	const style = components[id].styles

	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td style={style}>{/* <hr style={style} /> */}</td>
		</ComponentTemplate>
	)
}

function Spacing({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	const style = components[id].styles
	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				<div style={style}></div>
			</td>
		</ComponentTemplate>
	)
}
function TrackingPixel({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				<img
					src={components[id].values.src as string}
					width={1}
					height={1}
				/>
			</td>
		</ComponentTemplate>
	)
}

function Unsubscribe({
	activeComponent,
	setActiveComponent,
	id,
	components,
}: Props) {
	const style = components[id].styles

	return (
		<ComponentTemplate
			activeComponent={activeComponent}
			setActiveComponent={setActiveComponent}
			id={id}
			components={components}
		>
			<td>
				<a
					href={components[id].values.unsubscribeLink as string}
					style={style}
					onClick={(e) => {
						e.preventDefault()
					}}
				>
					Unsubscribe
				</a>
			</td>
		</ComponentTemplate>
	)
}

//! Unnecessary types have been removed

export type Component = {
	Component: React.ElementType<Props>
	type: ComponentTypes
	values: {
		[key: string]: string | number
	}
	styles: CSSProperties
	labels: string[]
	settings: {
		[key: string]: string | number
	}
}

export const COMPONENTS: { [key: string]: Component } = {
	Paragraph: {
		Component: Paragraph,
		type: ComponentTypes.Paragraph,
		values: {
			text: "This is a paragraph. Click to edit.",
		},
		styles: {
			...globalStyles,
			color: "#000000",
			fontSize: "16px",
		},
		labels: ["text"],
		settings: {},
	},
	Heading: {
		Component: Heading,
		type: ComponentTypes.Heading,
		values: {
			text: "This is a heading. Click to edit.",
		},
		styles: {
			...globalStyles,
			fontWeight: 1000,
			color: "#000000",
			fontSize: "30px",
			fontFamily: "Roboto, Arial, Helvetica, sans-serif",
		},
		labels: ["Heading text"],
		settings: {
			type: "h1",
		},
	},
	Button: {
		Component: Button,
		type: ComponentTypes.Button,
		values: {
			label: "Button",
			href: "https://example.com",
		},
		styles: {
			...globalStyles,
			fontSize: "16px",
			background: "#FF0000",
			color: "#FFFFFF",
			display: "block",
			minWidth: "100px",
			width: "max-content",
			padding: "14px",
			textAlign: "center",
			borderRadius: "var(--card-radius)",
			border: "none",
			textDecoration: "none",
			boxSizing: "border-box",
		},
		labels: ["Label", "URL"],
		settings: {},
	},
	Image: {
		Component: Image,
		type: ComponentTypes.Image,
		values: {
			src: "https://fakeimg.pl/150",
			alt: "Placeholder image",
		},
		styles: {
			...globalStyles,
			maxWidth: "100%",
		},
		labels: ["URL", "Alt text"],
		settings: {},
	},
	Line: {
		Component: Line,
		type: ComponentTypes.Line,
		values: {},
		styles: {
			...globalStyles,
			width: "100%",
			border: 0,
			borderTop: "1px solid #cccccc",
			background: "#CCCCCC",
			borderColor: "#CCCCCC",
			borderStyle: "solid",
			borderWidth: "1px",
		},
		labels: [],
		settings: {},
	},
	Spacing: {
		Component: Spacing,
		type: ComponentTypes.Spacing,
		values: {},
		styles: {
			...globalStyles,
			background: "transparent",
			height: "20px",
		},
		labels: [],
		settings: {},
	},
	TrackingPixel: {
		Component: TrackingPixel,
		type: ComponentTypes.TrackingPixel,
		values: {
			src: "",
		},
		styles: {},
		labels: ["Tacking SRC"],
		settings: {},
	},
	Unsubscribe: {
		Component: Unsubscribe,
		type: ComponentTypes.Unsubscribe,
		values: {
			unsubscribeLink: "https://example.com/unsubscribe",
		},
		styles: {
			textDecoration: "none",
			color: "var(--a-color)",
			fontSize: "16px",
		},
		labels: ["Unsubscribe Link"],
		settings: {},
	},
}

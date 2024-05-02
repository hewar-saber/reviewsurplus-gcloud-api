import { COMPONENTS, Component } from "../editor/components"
import { Contact, JSONComponent } from "../types"
import { v4 as uuidv4 } from "uuid"
import { replaceVariables } from "./util"
import { JSDOM } from "jsdom"
import { CSS_PROPERTIES, globalStyles, selectorStyles } from "../editor/util"

export async function convertToHTML(
	JSONComponents: JSONComponent[],
	trackingPixel?: string,
	contact?: Contact,
	redirectId?: string
): Promise<string> {
	const ReactDOMServer = (await import("react-dom/server")).default

	const components: { [key: string]: Component } = {}

	JSONComponents.forEach((skeleton: JSONComponent) => {
		const id = uuidv4()

		components[id] = {
			...COMPONENTS[skeleton.type],
			values: skeleton.values,
			styles: skeleton.styles,
			settings: skeleton.settings,
			type: skeleton.type as any,
			Popup: () => null,
		} as Component
	})

	if (trackingPixel !== undefined) {
		const id = uuidv4()

		components[id] = {
			...COMPONENTS.TrackingPixel,
			values: {
				src: trackingPixel,
			},
		}
	}

	if (contact !== undefined) {
		Object.entries(components).forEach(([id, { values, type }]) => {
			if (type === "Unsubscribe") {
				components[
					id
				].values.unsubscribeLink = `${process.env.WEBSITE_URL}/unsubscribe/${contact.displayId}`
				return
			}
			Object.entries(values).forEach(([valueKey, valueValue]) => {
				components[id].values[valueKey] = replaceVariables(
					valueValue.toString(),
					contact,
					redirectId
				).replaceAll(/data-href/g, "href")
			})
		})
	}

	const Component = (
		<table>
			<tbody>
				{Object.entries(components).map(([key, { Component }]) => {
					return (
						<Component
							id={key}
							components={components}
							key={key}
							activeComponent={null}
						/>
					)
				})}
			</tbody>
		</table>
	)

	const htmlStringFromComponent = ReactDOMServer.renderToString(Component)

	const dom = new JSDOM(htmlStringFromComponent)

	const document = dom.window.document

	const elements = document.querySelectorAll<HTMLElement>("*")

	elements.forEach((element) => {
		const skip = ["table", "tbody", "tr", "td", "a"]

		if (skip.includes(element.tagName.toLowerCase())) return

		Object.entries(globalStyles).forEach(([property, value]) => {
			element.style[property as any] = value
		})
	})

	selectorStyles.forEach(([selector, styles]) => {
		const elements = document.querySelectorAll<HTMLElement>(selector)
		elements.forEach((element) => {
			Object.entries(styles).forEach(([property, value]) => {
				element.style[property as any] = value
			})
		})
	})

	let outerHTML = document.documentElement.outerHTML

	Object.entries(CSS_PROPERTIES).forEach(([key, value]) => {
		outerHTML = outerHTML.replaceAll(
			new RegExp(`var\\(${key}\\)`, "g"),
			value
		)
	})

	return outerHTML
}

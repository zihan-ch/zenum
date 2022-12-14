import { z } from "zod"
import { Matchers, zenum, ZitemCreationSugur } from "./unsafe.js"

export type SafeZitem<
	TD extends SafeTypeDef = any,
	K extends keyof TD = keyof TD
> = [keyof TD, z.infer<TD[K]>]
export type SafeZitemType<I extends SafeZitem = SafeZitem> = I[0]
export type SafeZitemData<I extends SafeZitem = SafeZitem> = I[1]

export const ZenumError = zenum<{
	itemTypeIllegal: SafeZitemType<SafeZitem>
	itemDataIllegal: SafeZitemData<SafeZitem>
	notAnItem: unknown
}>()
type ZenumError = typeof ZenumError.Item

export type SafeTypeDef = Record<string, z.ZodType>

function createParseResultZenum<TD extends SafeTypeDef>() {
	return zenum<{
		success: SafeZitem<TD>
		error: ZenumError
	}>()
}

class SafeZenum<TD extends SafeTypeDef> {
	_def: TD
	Result: ReturnType<typeof createParseResultZenum<TD>>

	constructor(typeDef: TD) {
		this._def = typeDef
		this.Result = createParseResultZenum<TD>()
	}

	type<K extends keyof TD>(item: SafeZitem<TD, K>) {
		return item[0]
	}

	data<I extends keyof TD>(item: SafeZitem<TD, I>) {
		return item[1]
	}

	/**
	 * Caution: This is not type safe enough! This will not parse the data.
	 */
	match<R, K extends keyof TD>(
		item: SafeZitem<TD, K>,
		matchers: SafeMatchers<TD, R>
	): R {
		return (
			matchers[this.type(item)] ||
			matchers._ ||
			((data) => {
				throw new Error(
					`No matchers found! The data received (json): ${JSON.stringify(
						data
					)}`
				)
			})
		)(this.data(item))
	}

	run<R, K extends keyof TD>(
		item: SafeZitem<TD, K>,
		matchers: Partial<SafeMatchers<TD, R>>
	): R {
		return this.match(item, matchers as SafeMatchers<TD, R>)
	}

	parse<K extends keyof TD>(item: unknown) {
		if (Array.isArray(item) && item.length === 2) {
			const type = this.type(item as any)
			const def = this._def[type]

			if (def) {
				const data = this.data(item as any)
				const result = def.safeParse(data)
				if (result.success) return this.Result.success(item as any)
				else return this.Result.error(ZenumError.itemDataIllegal(data))
			}

			return this.Result.error(ZenumError.itemTypeIllegal(type))
		}

		return this.Result.error(ZenumError.notAnItem(item))
	}

	item<K extends SafeZitemType<SafeZitem<TD>>>(
		k: K,
		data: SafeZitemData<SafeZitem<TD, K>>
	): SafeZitem<TD, K> {
		return [k, data]
	}

	semantic<K extends keyof TD>(item: SafeZitem<TD, K>) {
		return {
			type: this.type(item),
			data: this.data(item),
		}
	}

	is<K extends keyof TD, I extends SafeZitem<TD>>(key: K, item: I) {
		return key === this.type(item)
	}

	Item: SafeZitem<TD>

	get zod() {
		return z.custom<SafeZitem<TD>>((data) =>
			this.Result.match(this.parse(data), {
				success(data) {
					return true
				},
				error(error) {
					return false
				},
			})
		)
	}
}

export type SafeMatchers<TD extends SafeTypeDef = any, R = any> = Matchers<
	SafeTypeDefToTypeDef<TD>,
	R
>

export type SafeZenumFactory<TD extends SafeTypeDef> = InstanceType<
	typeof SafeZenum<TD>
> &
	ZitemCreationSugur<SafeTypeDefToTypeDef<TD>>

type SafeTypeDefToTypeDef<TD extends SafeTypeDef> = {
	[K in keyof TD]: z.infer<TD[K]>
}

export function safeZenum<TD extends SafeTypeDef>(
	typeDef: TD
): SafeZenumFactory<TD> {
	const safeZenum = new SafeZenum(typeDef)
	const proxy = new Proxy(safeZenum, {
		get<K extends string>(target, p: K) {
			return (
				target[p] ??
				((data: z.infer<TD[keyof TD]>) => target.item(p, data))
			)
		},
	}) as SafeZenumFactory<TD>

	return proxy
}

import { Action } from '../actions/action'
import { Trigger } from '../triggers/trigger'
import { FLOW_ITEM_HEIGHT, FLOW_ITEM_WIDTH } from './draw-common'

export type Position = {
    x: number
    y: number
}

export class PositionedStep {
    x: number
    y: number
    content: Action | Trigger

    constructor({
        x,
        y,
        content,
    }: {
        x: number
        y: number
        content: Action | Trigger
    }) {
        this.x = x
        this.y = y
        this.content = content
    }

    center(position: 'top' | 'bottom'): { x: number, y: number } {
        if (position === 'top') {
            return {
                x: this.x + FLOW_ITEM_WIDTH / 2.0,
                y: this.y,
            }
        }
        else {
            return {
                x: this.x + FLOW_ITEM_WIDTH / 2.0,
                y: this.y + FLOW_ITEM_HEIGHT,
            }
        }
    }
}
